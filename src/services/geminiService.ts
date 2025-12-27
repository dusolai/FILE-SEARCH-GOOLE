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

// Función auxiliar necesaria (asegúrate de que está aquí)
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

// --- FUNCIÓN CORREGIDA Y ROBUSTA ---
export async function uploadToRagStore(ragStoreName: string, file: File): Promise<void> {
    console.log(`📤 Subiendo ${file.name}...`);
    
    // 1. Subir Archivo
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mimeType", getMimeType(file));
    // CORRECCIÓN: Enviamos el nombre explícitamente para evitar errores en el backend
    formData.append("displayName", file.name);

    const uploadRes = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData
    });

    if (!uploadRes.ok) {
        // Intentamos leer el error con seguridad
        const text = await uploadRes.text();
        let errorMsg = text;
        try {
            const json = JSON.parse(text);
            errorMsg = json.error || text;
        } catch (e) {}
        
        throw new Error(`Fallo subida: ${errorMsg}`);
    }
    
    const fileData = await uploadRes.json();
    // A veces Google devuelve la info dentro de 'file' o 'newFile'
    const fileId = fileData.name || fileData.file?.name || fileData.newFile?.name; 
    
    if (!fileId) throw new Error("El servidor no devolvió el ID del archivo. Respuesta: " + JSON.stringify(fileData));

    console.log(`🔗 Vinculando ${fileId} a ${ragStoreName}...`);

    // 2. Vincular
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
// -----------------------------------

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