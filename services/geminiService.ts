/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { QueryResult } from '../types';

let ai: GoogleGenAI;

export function initialize() {
    // CORRECCIÓN CRÍTICA: Usamos import.meta.env para Vite/Cloudflare Pages
    const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
    if (!apiKey) {
        console.error("Falta la variable VITE_GOOGLE_API_KEY. Asegúrate de añadirla en Cloudflare Pages > Settings > Environment Variables.");
        throw new Error("API Key no encontrada");
    }
    ai = new GoogleGenAI({ apiKey: apiKey });
}

async function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createRagStore(displayName: string): Promise<string> {
    if (!ai) initialize();
    const ragStore = await ai.fileSearchStores.create({ config: { displayName } });
    if (!ragStore.name) {
        throw new Error("Failed to create RAG store: name is missing.");
    }
    return ragStore.name;
}

export async function uploadToRagStore(ragStoreName: string, file: File): Promise<void> {
    if (!ai) initialize();
    
    let op = await ai.fileSearchStores.uploadToFileSearchStore({
        fileSearchStoreName: ragStoreName,
        file: file
    });

    // Esperar a que Google procese el archivo
    while (!op.done) {
        await delay(3000);
        op = await ai.operations.get({operation: op});
    }
}

export async function fileSearch(ragStoreName: string, query: string): Promise<QueryResult> {
    if (!ai) initialize();
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: query + " DO NOT ASK THE USER TO READ THE MANUAL, pinpoint the relevant sections in the response itself.",
        config: {
            tools: [
                    {
                        fileSearch: {
                            fileSearchStoreNames: [ragStoreName],
                        }
                    }
                ]
        }
    });

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    return {
        text: response.text || "No se pudo obtener respuesta.",
        groundingChunks: groundingChunks,
    };
}

export async function generateExampleQuestions(ragStoreName: string): Promise<string[]> {
    if (!ai) initialize();
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: "Return ONLY a JSON array of 4 short practical questions strings like [\"Q1\", \"Q2\"].",
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
        console.error("Error generating questions:", error);
        return [];
    }
}

export async function deleteRagStore(ragStoreName: string): Promise<void> {
    if (!ai) initialize();
    await ai.fileSearchStores.delete({
        name: ragStoreName,
        config: { force: true },
    });
}
