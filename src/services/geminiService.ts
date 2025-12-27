/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { QueryResult } from '../types';

// ==========================================
// TU URL DE BACKEND DE GOOGLE CLOUD RUN
// ==========================================
const API_BASE = "https://backend-cerebro-987192214624.europe-southwest1.run.app";

export function initialize(apiKey?: string) {
    console.log(`🚀 Frontend conectado a: ${API_BASE}`);
}

function getMimeType(file: File): string {
    if (file.type && file.type !== "") return file.type;
    const name = file.name.toLowerCase();
    if (name.endsWith('.md')) return 'text/md';
    if (name.endsWith('.txt')) return 'text/plain';
    if (name.endsWith('.pdf')) return 'application/pdf';
    return 'text/plain';
}

export async function createRagStore(displayName: string): Promise<string> {
    console.log("Creando cerebro...");
    const res = await fetch(`${API_BASE}/create-store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Error creando cerebro: ${text}`);
    }
    const data = await res.json();
    return data.name;
}

export async function uploadToRagStore(ragStoreName: string, file: File): Promise<void> {
    console.log(`📤 Subiendo ${file.name} al backend...`);
    
    // 1. Preparar datos
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mimeType", getMimeType(file));
    formData.append("displayName", file.name);

    // 2. Subir
    const uploadRes = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData
    });

    if (!uploadRes.ok) {
        const text = await uploadRes.text();
        throw new Error(`Fallo subida backend: ${text}`);
    }
    
    const fileData = await uploadRes.json();
    // Intentamos obtener el ID de varias formas posibles
    const fileId = fileData.name || fileData.file?.name || fileData.newFile?.name; 
    
    if (!fileId) {
        console.warn("Advertencia: No se recibió ID del archivo, pero la subida parece exitosa.", fileData);
    } else {
        console.log(`✅ Archivo subido a Google: ${fileId}`);
    }

    // 3. Vincular (Confirmación)
    await fetch(`${API_BASE}/link-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: ragStoreName, fileId: fileId })
    });
}

export async function fileSearch(ragStoreName: string, query: string): Promise<QueryResult> {
    const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: ragStoreName, query })
    });

    if (!res.ok) return { text: "Error comunicando con el cerebro.", groundingChunks: [] };
    
    const data = await res.json();
    return {
        text: data.text,
        groundingChunks: data.groundingChunks || []
    };
}

export async function generateExampleQuestions(ragStoreName: string): Promise<string[]> {
    return ["¿Resumen del documento?", "¿Cuáles son las ideas principales?", "¿Hay alguna conclusión importante?"];
}