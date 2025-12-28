/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { QueryResult } from '../types';

// =================================================================
// 🚀 CONEXIÓN CON EL CEREBRO EN LA NUBE
// =================================================================
// Tu URL de Google Cloud Run
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
    const res = await fetch(`${API_BASE}/create-store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName })
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    console.log(`📦 Store simulado creado: ${data.name}`);
    return data.name;
}

export async function uploadToRagStore(ragStoreName: string, file: File): Promise<void> {
    console.log(`📤 Enviando ${file.name} a Google Cloud Run...`);
    
    // 1. Preparar el formulario
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mimeType", getMimeType(file));
    formData.append("displayName", file.name);

    // 2. Subir al Backend
    // IMPORTANTE: No ponemos cabeceras manuales para que el navegador gestione el Multipart
    const uploadRes = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData
    });

    if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        console.error("❌ Error Backend:", errorText);
        throw new Error(`Error subiendo archivo: ${errorText}`);
    }
    
    // 3. Procesar respuesta
    const fileData = await uploadRes.json();
    // Google devuelve 'name' (resource name) y 'uri'. Usamos 'name' como ID.
    const fileId = fileData.name || fileData.uri; 
    
    console.log(`✅ Archivo recibido en Google: ${fileId}`);
    
    // 4. Vincular (Confirmación al backend)
    await fetch(`${API_BASE}/link-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            storeId: ragStoreName, 
            fileId: fileId,
            fileName: file.name
        })
    });
    
    console.log("🔗 Archivo vinculado correctamente.");
}

export async function fileSearch(ragStoreName: string, query: string): Promise<QueryResult> {
    console.log(`🔍 Buscando: "${query}"`);
    
    const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: ragStoreName, query })
    });

    if (!res.ok) {
        console.error("❌ Error en chat");
        return { text: "Error comunicando con el cerebro.", groundingChunks: [] };
    }
    
    const data = await res.json();
    return {
        text: data.text,
        groundingChunks: data.groundingChunks || []
    };
}

export async function generateExampleQuestions(ragStoreName: string): Promise<string[]> {
    return ["¿De qué trata el documento?", "¿Resumen breve?", "¿Conclusiones principales?"];
}
