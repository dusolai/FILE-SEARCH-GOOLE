/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { QueryResult } from '../types';

let ai: GoogleGenAI;

export function initialize() {
    // CORRECCIÓN: Usamos import.meta.env para Vite
    const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
    if (!apiKey) {
        console.error("Falta la VITE_GOOGLE_API_KEY. Asegúrate de ponerla en Cloudflare Pages.");
        throw new Error("API Key no encontrada");
    }
    ai = new GoogleGenAI({ apiKey: apiKey });
}

async function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createRagStore(displayName: string): Promise<string> {
    if (!ai) initialize(); // Aseguramos que se inicialice si no lo está
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

    // Esperamos a que Google termine de procesar el archivo
    while (!op.done) {
        await delay(3000);
        op = await ai.operations.get({operation: op});
    }
}

export async function fileSearch(ragStoreName: string, query: string): Promise<QueryResult> {
    if (!ai) initialize();
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-1.5-flash', // Usamos flash por velocidad, o pro para calidad
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
        text: response.text || "No se pudo generar respuesta.",
        groundingChunks: groundingChunks,
    };
}

export async function generateExampleQuestions(ragStoreName: string): Promise<string[]> {
    if (!ai) initialize();
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: "You are provided some user manuals. Figure out the product and generate 4 short practical questions. Return ONLY a JSON array of strings like [\"Question 1\", \"Question 2\"].",
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
        
        let jsonText = response.text?.trim() || "";
        
        // Limpieza básica de JSON por si el modelo añade markdown
        const jsonMatch = jsonText.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
            jsonText = jsonMatch[1];
        } else {
             // Intento de encontrar array limpio
            const firstBracket = jsonText.indexOf('[');
            const lastBracket = jsonText.lastIndexOf(']');
            if (firstBracket !== -1 && lastBracket !== -1) {
                jsonText = jsonText.substring(firstBracket, lastBracket + 1);
            }
        }
        
        const parsedData = JSON.parse(jsonText);
        
        // Adaptación flexible a formatos
        if (Array.isArray(parsedData)) {
            if (parsedData.length > 0 && typeof parsedData[0] === 'string') {
                return parsedData;
            }
            // Si devuelve objetos complejos, aplanamos
            if (parsedData.length > 0 && typeof parsedData[0] === 'object') {
                 return parsedData.flatMap((item: any) => item.questions || []).filter((q:any) => typeof q === 'string');
            }
        }
        return [];
    } catch (error) {
        console.error("Failed to generate questions:", error);
        return [];
    }
}

export async function deleteRagStore(ragStoreName: string): Promise<void> {
    if (!ai) initialize();
    await ai.fileSearchStores.delete({
        name: ragStoreName,
        config: { force: true }, // Forzamos borrado aunque tenga archivos
    });
}
