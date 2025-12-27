/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { QueryResult } from '../types';

// ======================================================
// CAMBIO CLAVE: Conectamos con tu servidor en la nube
// ======================================================
const API_BASE = "https://backend-cerebro-987192214624.europe-southwest1.run.app";

export function initialize(apiKey?: string) {
    console.log(`🚀 Frontend conectado a Google Cloud Run: ${API_BASE}`);
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
    console.log("🧠 Solicitando nuevo cerebro al backend...");
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
    console.log(`📤 Subiendo ${file.name} a la nube...`);
    
    // 1. Preparar datos (Incluimos el nombre explícitamente para evitar errores)
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mimeType", getMimeType(file));
    formData.append("displayName", file.name); 

    // 2. Subir al Backend
    const uploadRes = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData
    });

    if (!uploadRes.ok) {
        const text = await uploadRes.text();
        throw new Error(`Fallo subida backend: ${text}`);
    }
    
    const fileData = await uploadRes.json();
    
    // 3. Obtener ID de forma segura (Google a veces cambia la estructura de respuesta)
    const fileId = fileData.name || fileData.file?.name || fileData.newFile?.name; 
    
    if (!fileId) {
        console.warn("⚠️ Advertencia: El servidor aceptó el archivo pero no devolvió un ID claro.", fileData);
    } else {
        console.log(`✅ Archivo recibido en Google con ID: ${fileId}`);
    }

    // 4. Vincular (Confirmación al backend)
    console.log(`🔗 Vinculando a ${ragStoreName}...`);
    const linkRes = await fetch(`${API_BASE}/link-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: ragStoreName, fileId: fileId })
    });

    if (!linkRes.ok) {
         console.warn("Error no crítico en vinculación (el archivo ya está en la nube)");
    }
    
    console.log("✅ Proceso completado.");
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