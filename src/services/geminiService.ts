/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { QueryResult } from '../types';

// Al usar Pages Functions, la API está en el mismo dominio, bajo /api
const API_BASE = "/api";

export function initialize(apiKey?: string) {
    console.log("🚀 Frontend listo. Usando Cloudflare Functions en /api");
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
    const res = await fetch(`${API_BASE}/create-store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(`Error creando cerebro: ${err.error}`);
    }
    const data = await res.json();
    return data.name;
}

export async function uploadToRagStore(ragStoreName: string, file: File): Promise<void> {
    console.log(`📤 Subiendo ${file.name}...`);
    
    // 1. Subir Archivo
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mimeType", getMimeType(file));

    const uploadRes = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData
    });

    if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({ error: uploadRes.statusText }));
        throw new Error(`Fallo subida: ${err.error}`);
    }
    
    const fileData = await uploadRes.json();
    const fileId = fileData.name || fileData.file?.name; 
    
    if (!fileId) throw new Error("El servidor no devolvió el ID del archivo.");

    console.log(`🔗 Vinculando ${fileId} a ${ragStoreName}...`);

    // 2. Vincular (Ahora lo hace el Backend Function)
    const linkRes = await fetch(`${API_BASE}/link-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: ragStoreName, fileId: fileId })
    });

    if (!linkRes.ok) {
        const err = await linkRes.json().catch(() => ({ error: linkRes.statusText }));
        throw new Error(`Fallo vinculación: ${err.error}`);
    }

    console.log("✅ Archivo listo.");
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
    return ["¿Resumen de los documentos?", "¿Puntos clave?", "¿Qué conclusiones hay?"];
}