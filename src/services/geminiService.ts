/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { QueryResult } from '../types';

let ai: GoogleGenAI | null = null;

// --- 1. FUNCIÓN DE LIMPIEZA Y CONEXIÓN ---
export function initialize(apiKey?: string) {
    let keyToUse = apiKey ? apiKey.trim() : undefined;
    if (!keyToUse) keyToUse = localStorage.getItem('gemini_api_key') || undefined;
    if (!keyToUse) keyToUse = import.meta.env.VITE_GOOGLE_API_KEY;

    if (!keyToUse) {
        console.warn("⚠️ GeminiService: Esperando API Key...");
        return; 
    }

    try {
        ai = new GoogleGenAI({ apiKey: keyToUse });
        console.log("✅ Gemini Conectado.");
    } catch (e) {
        console.error("❌ Fallo en conexión inicial:", e);
    }
}

function getAiInstance() {
    if (!ai) {
        initialize();
        if (!ai) throw new Error("No hay conexión con Gemini. Recarga y pon la Key.");
    }
    return ai!;
}

// --- 2. DETECTOR MANUAL DE TIPOS ---
function getMimeType(file: File): string {
    if (file.type && file.type !== "") return file.type;
    
    const name = file.name.toLowerCase();
    if (name.endsWith('.md')) return 'text/md';
    if (name.endsWith('.txt')) return 'text/plain';
    if (name.endsWith('.pdf')) return 'application/pdf';
    if (name.endsWith('.csv')) return 'text/csv';
    
    return 'text/plain';
}

async function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- 3. CREAR CEREBRO ---
export async function createRagStore(displayName: string): Promise<string> {
    const aiInstance = getAiInstance();
    console.log(`🧠 Creando estructura: ${displayName}`);
    
    try {
        const response: any = await aiInstance.fileSearchStores.create({ 
            config: { displayName } 
        });

        const storeName = response.name || 
                          response.fileSearchStore?.name || 
                          response.newFileSearchStore?.name;

        if (!storeName) {
            console.error("Respuesta Google:", response);
            throw new Error("Google no devolvió el ID del Cerebro.");
        }

        console.log(`✅ Cerebro ID: ${storeName}`);
        return storeName;
    } catch (error: any) {
        console.error("🔥 Error CreateStore:", error);
        throw new Error(`Fallo al crear cerebro: ${error.message}`);
    }
}

// --- 4. SUBIR ARCHIVO (VERSIÓN CORREGIDA CON REST API) ---
export async function uploadToRagStore(ragStoreName: string, file: File): Promise<void> {
    const realMimeType = getMimeType(file);
    
    console.log(`🚀 Subiendo: ${file.name} | Tipo detectado: ${realMimeType}`);

    try {
        const aiInstance = getAiInstance();
        const apiKey = localStorage.getItem('gemini_api_key');
        
        if (!apiKey) {
            throw new Error("No se encontró la API Key en localStorage");
        }

        // PASO A: Subir a la nube temporal
        const uploadResponse = await aiInstance.files.upload({
            file: file,
            config: { 
                displayName: file.name, 
                mimeType: realMimeType 
            }
        });
        
        console.log(`☁️ Subido OK. ID Temporal: ${uploadResponse.name}`);

        // PASO B: Esperar a que Google lo procese
        let processedFile = uploadResponse; 
        let attempts = 0;
        
        while (processedFile.state === 'PROCESSING') {
            attempts++;
            if (attempts > 30) throw new Error("Tiempo de espera agotado procesando archivo.");
            
            console.log(`⏳ Procesando... (${attempts*2}s)`);
            await delay(2000); 
            
            processedFile = await aiInstance.files.get({ name: uploadResponse.name });
        }

        if (processedFile.state === 'FAILED') {
            throw new Error(`Google rechazó el archivo. Error: ${processedFile.error?.message || 'Desconocido'}`);
        }

        console.log(`✅ Archivo procesado: ${processedFile.name}`);

        // PASO C: VINCULAR usando REST API directa (SOLUCIÓN AL BUG DEL SDK)
        console.log(`🔗 Conectando a memoria ${ragStoreName}...`);
        
        const cleanStoreId = ragStoreName.replace("fileSearchStores/", "");

        // Usar REST API directamente porque el SDK no tiene fileSearchStores.files.create
        const linkResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/fileSearchStores/${cleanStoreId}/files`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey
                },
                body: JSON.stringify({
                    file: processedFile.name // "files/abc..."
                })
            }
        );

        if (!linkResponse.ok) {
            const errorText = await linkResponse.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                errorData = { message: errorText };
            }
            
            console.error("❌ Error de vinculación:", errorData);
            throw new Error(`Error al vincular archivo (${linkResponse.status}): ${errorData.error?.message || errorData.message || errorText}`);
        }

        const linkResult = await linkResponse.json();
        console.log(`🎉 ¡${file.name} vinculado correctamente!`, linkResult);

    } catch (error: any) {
        const msg = error.message || JSON.stringify(error);
        console.error(`❌ Error fatal con ${file.name}:`, msg);
        
        // Errores específicos mejorados
        if (msg.includes("403") || msg.includes("PERMISSION_DENIED")) {
            throw new Error("Error 403: La API Key no tiene permisos. Verifica que tenga acceso a 'Generative Language API' habilitado.");
        }
        if (msg.includes("429")) {
            throw new Error("Error 429: Demasiadas peticiones. Espera un momento e intenta de nuevo.");
        }
        if (msg.includes("INVALID_ARGUMENT") || msg.includes("400")) {
            throw new Error(`Error 400: Argumento inválido. Verifica que el store (${ragStoreName}) y el archivo existan.`);
        }
        if (msg.includes("404") || msg.includes("NOT_FOUND")) {
            throw new Error("Error 404: Store o archivo no encontrado. El ID podría haber expirado.");
        }
        
        throw new Error(`Error subiendo ${file.name}: ${msg}`);
    }
}

// --- 5. BÚSQUEDA (CHAT) ---
export async function fileSearch(ragStoreName: string, query: string): Promise<QueryResult> {
    const aiInstance = getAiInstance();
    if (!ragStoreName) return { text: "⚠️ Error: No hay cerebro conectado.", groundingChunks: [] };

    try {
        const response: GenerateContentResponse = await aiInstance.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: query,
            config: {
                tools: [{ fileSearch: { fileSearchStoreNames: [ragStoreName] } }]
            }
        });

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        return {
            text: response.text || "No encontré nada relevante en los documentos.",
            groundingChunks: groundingChunks,
        };
    } catch (e: any) {
        console.error("Error Chat:", e);
        return { text: `Error de conexión: ${e.message}`, groundingChunks: [] };
    }
}

export async function generateExampleQuestions(ragStoreName: string): Promise<string[]> {
    return ["¿Resumen de los documentos?", "¿Puntos clave?", "¿Qué conclusiones hay?"];
}
