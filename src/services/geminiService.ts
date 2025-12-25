/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { QueryResult } from '../types';

let ai: GoogleGenAI | null = null;

export function initialize(apiKey?: string) {
    // 1. Limpieza agresiva de la clave (quita espacios invisibles)
    let keyToUse = apiKey ? apiKey.trim() : undefined;
    
    if (!keyToUse) {
        keyToUse = localStorage.getItem('gemini_api_key') || undefined;
    }

    // Fallback a variables de entorno
    if (!keyToUse) {
        keyToUse = import.meta.env.VITE_GOOGLE_API_KEY;
    }

    if (!keyToUse) {
        console.warn("GeminiService: No API Key found yet.");
        return; 
    }

    try {
        ai = new GoogleGenAI({ apiKey: keyToUse });
        console.log("✅ Gemini Service inicializado correctamente.");
    } catch (error) {
        console.error("❌ Error al inicializar Gemini:", error);
        throw error;
    }
}

function getAiInstance() {
    if (!ai) {
        initialize();
        if (!ai) throw new Error("API Key no configurada. Por favor, introdúcela en la pantalla de inicio.");
    }
    return ai!;
}

async function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createRagStore(displayName: string): Promise<string> {
    const aiInstance = getAiInstance();
    console.log(`Creando cerebro: ${displayName}...`);
    const ragStore = await aiInstance.fileSearchStores.create({ config: { displayName } });
    
    if (!ragStore.name) throw new Error("Google no devolvió el ID del Store.");
    console.log(`✅ Cerebro creado: ${ragStore.name}`);
    return ragStore.name;
}

export async function uploadToRagStore(ragStoreName: string, file: File): Promise<void> {
    const aiInstance = getAiInstance();
    console.log(`Subiendo ${file.name} a ${ragStoreName}...`);
    
    let op = await aiInstance.fileSearchStores.uploadToFileSearchStore({
        fileSearchStoreName: ragStoreName,
        file: file
    });

    // Espera activa con polling
    while (!op.done) {
        await delay(2000);
        op = await aiInstance.operations.get({operation: op});
        console.log(`Procesando ${file.name}...`);
    }
    console.log(`✅ ${file.name} indexado correctamente.`);
}

export async function fileSearch(ragStoreName: string, query: string): Promise<QueryResult> {
    const aiInstance = getAiInstance();
    const response: GenerateContentResponse = await aiInstance.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: query + " Responde en español. Usa STRICTAMENTE la información del contexto proporcionado.",
        config: {
            tools: [{ fileSearch: { fileSearchStoreNames: [ragStoreName] } }]
        }
    });

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    return {
        text: response.text || "No encontré información relevante en tus documentos.",
        groundingChunks: groundingChunks,
    };
}

export async function generateExampleQuestions(ragStoreName: string): Promise<string[]> {
    const aiInstance = getAiInstance();
    try {
        const response = await aiInstance.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: "Genera 3 preguntas cortas y muy prácticas que un usuario podría hacerle a estos documentos. Devuelve SOLO un array JSON de strings.",
            config: {
                tools: [{ fileSearch: { fileSearchStoreNames: [ragStoreName] } }]
            }
        });
        
        let jsonText = response.text?.trim() || "[]";
        const jsonMatch = jsonText.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) jsonText = jsonMatch[1];
        
        const parsed = JSON.parse(jsonText);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (error) {
        console.warn("No se pudieron generar preguntas auto:", error);
        return ["¿Qué dice el manual?", "¿Resumen principal?", "¿Pasos clave?"];
    }
}