/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { QueryResult } from '../types';

let ai: GoogleGenAI | null = null;

// AHORA ACEPTA LA CLAVE COMO PARÁMETRO
export function initialize(apiKey?: string) {
    // 1. Intentamos usar la clave pasada
    let keyToUse = apiKey;
    
    // 2. Si no, miramos en localStorage
    if (!keyToUse) {
        keyToUse = localStorage.getItem('gemini_api_key') || undefined;
    }

    // 3. Si no, intentamos variable de entorno (fallback)
    if (!keyToUse) {
        keyToUse = import.meta.env.VITE_GOOGLE_API_KEY;
    }

    if (!keyToUse) {
        console.warn("GeminiService: No API Key found yet.");
        return; 
    }

    ai = new GoogleGenAI({ apiKey: keyToUse });
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
    const ragStore = await aiInstance.fileSearchStores.create({ config: { displayName } });
    if (!ragStore.name) throw new Error("Failed to create RAG store");
    return ragStore.name;
}

export async function uploadToRagStore(ragStoreName: string, file: File): Promise<void> {
    const aiInstance = getAiInstance();
    
    let op = await aiInstance.fileSearchStores.uploadToFileSearchStore({
        fileSearchStoreName: ragStoreName,
        file: file
    });

    while (!op.done) {
        await delay(2000); // Polling cada 2s
        op = await aiInstance.operations.get({operation: op});
    }
}

export async function fileSearch(ragStoreName: string, query: string): Promise<QueryResult> {
    const aiInstance = getAiInstance();
    const response: GenerateContentResponse = await aiInstance.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: query + " Responde en español. Basa tu respuesta ESTRICTAMENTE en los documentos proporcionados.",
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
            contents: "Genera 4 preguntas cortas en español sobre el contenido de estos documentos. Devuelve SOLO un array JSON de strings.",
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
        console.error("Error generando preguntas:", error);
        return ["¿De qué tratan estos documentos?", "¿Resumen principal?", "¿Puntos clave?", "¿Conclusiones?"];
    }
}
