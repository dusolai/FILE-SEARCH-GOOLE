/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { QueryResult } from '../types';

let ai: GoogleGenAI | null = null;

export function initialize(apiKey?: string) {
    let keyToUse = apiKey ? apiKey.trim() : undefined;
    if (!keyToUse) {
        keyToUse = localStorage.getItem('gemini_api_key') || undefined;
    }
    if (!keyToUse) {
        keyToUse = import.meta.env.VITE_GOOGLE_API_KEY;
    }
    if (!keyToUse) {
        console.warn("GeminiService: No API Key found yet.");
        return; 
    }
    // Aseguramos que la instancia se cree limpia
    ai = new GoogleGenAI({ apiKey: keyToUse });
    console.log("✅ Gemini Service inicializado.");
}

function getAiInstance() {
    if (!ai) {
        initialize();
        if (!ai) throw new Error("API Key no configurada.");
    }
    return ai!;
}

// Función auxiliar para convertir File a Base64 (Necesario para navegadores)
async function fileToGenerativePart(file: File): Promise<{ inlineData: { data: string; mimeType: string } }> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve({
                inlineData: {
                    data: base64String,
                    mimeType: file.type
                }
            });
        };
        reader.readAsDataURL(file);
    });
}

export async function createRagStore(displayName: string): Promise<string> {
    const aiInstance = getAiInstance();
    console.log(`🧠 Intentando crear cerebro: ${displayName}...`);
    
    try {
        const response = await aiInstance.fileSearchStores.create({ 
            config: { displayName } 
        });

        console.log("📦 Respuesta completa de Google (Debug):", response);

        // BUSCAMOS EL ID DONDE SEA QUE ESTÉ (A veces cambia la estructura)
        // Puede estar en 'name', en 'fileSearchStore.name' o 'response.name'
        const storeName = response.name || (response as any).fileSearchStore?.name || (response as any).newFileSearchStore?.name;

        if (!storeName) {
            console.error("❌ Estructura recibida:", JSON.stringify(response, null, 2));
            throw new Error("Google devolvió una respuesta vacía o sin nombre.");
        }

        console.log(`✅ Cerebro creado con éxito: ${storeName}`);
        return storeName;
    } catch (error: any) {
        console.error("🔥 Error crítico creando store:", error);
        throw new Error(`Fallo al crear store: ${error.message || error}`);
    }
}

export async function uploadToRagStore(ragStoreName: string, file: File): Promise<void> {
    const aiInstance = getAiInstance();
    console.log(`📤 Subiendo ${file.name} (tipo: ${file.type})...`);

    try {
        // PASO 1: Subir el archivo a la "nube temporal" de Google (Files API)
        // En navegador, usamos upload() normal primero
        const uploadResponse = await aiInstance.files.upload({
            file: file, // El SDK nuevo suele aceptar File de navegador aquí
            config: { 
                displayName: file.name,
                mimeType: file.type || 'text/plain' 
            }
        });
        
        console.log(`✅ Archivo subido a temporal: ${uploadResponse.file.name}`);

        // PASO 2: Importar ese archivo al Cerebro (RAG Store)
        console.log(`🔗 Vinculando ${uploadResponse.file.name} al cerebro ${ragStoreName}...`);
        
        // Esperamos a que el archivo esté ACTIVO antes de importar
        let fileState = uploadResponse.file.state;
        while (fileState === 'PROCESSING') {
            console.log("⏳ Procesando archivo...");
            await new Promise(r => setTimeout(r, 2000));
            const fileCheck = await aiInstance.files.get({ name: uploadResponse.file.name });
            fileState = fileCheck.state;
        }

        if (fileState === 'FAILED') throw new Error("El procesamiento del archivo falló en Google.");

        // Ahora lo metemos en el store
        await aiInstance.fileSearchStores.importFile({
            fileSearchStoreName: ragStoreName,
            file: uploadResponse.file.name // Usamos el ID del archivo subido (files/xxxx)
        });

        console.log(`🎉 ${file.name} integrado en la memoria.`);

    } catch (error: any) {
        console.error("❌ Error en subida:", error);
        throw new Error(`Error subiendo ${file.name}: ${error.message}`);
    }
}

export async function fileSearch(ragStoreName: string, query: string): Promise<QueryResult> {
    const aiInstance = getAiInstance();
    // Validamos que el store exista antes de preguntar
    if (!ragStoreName) return { text: "Error: No hay cerebro conectado.", groundingChunks: [] };

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
            text: response.text || "Sin respuesta.",
            groundingChunks: groundingChunks,
        };
    } catch (e) {
        console.error("Error en búsqueda:", e);
        return { text: "Error de conexión con Gemini.", groundingChunks: [] };
    }
}

// Mantenemos esta función igual, es segura
export async function generateExampleQuestions(ragStoreName: string): Promise<string[]> {
    return ["¿Qué dice el documento?", "¿Resumen clave?", "¿Datos importantes?"];
}
