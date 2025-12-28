/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { QueryResult } from '../types';

// =================================================================
// 🚀 CONEXIÓN CON EL CEREBRO EN LA NUBE
// =================================================================
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
    console.log(`📦 Store creado: ${data.name}`);
    return data.name;
}

export async function uploadToRagStore(ragStoreName: string, file: File): Promise<void> {
    console.log(`📤 Enviando ${file.name} a Google Cloud Run...`);
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mimeType", getMimeType(file));
    formData.append("displayName", file.name);

    // PASO 1: Subir archivo a Gemini
    const uploadRes = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData
    });

    if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        console.error("❌ Error Backend:", errorText);
        throw new Error(`Error subiendo archivo: ${errorText}`);
    }
    
    const uploadData = await uploadRes.json();
    console.log("✅ Archivo recibido en la nube:", uploadData.file.uri);
    
    // PASO 2: Vincular archivo al store (CRÍTICO para RAG)
    const linkRes = await fetch(`${API_BASE}/link-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            storeId: ragStoreName, 
            fileUri: uploadData.file.uri,
            fileName: file.name
        })
    });
    
    if (!linkRes.ok) {
        console.error("⚠️ Error vinculando archivo al store");
    } else {
        const linkData = await linkRes.json();
        console.log(`🔗 Archivo vinculado. Archivos totales en store: ${linkData.filesInStore}`);
    }
}

export async function fileSearch(ragStoreName: string, query: string): Promise<QueryResult> {
    console.log(`🔍 Buscando en cerebro: ${ragStoreName}`);
    console.log(`   Query: "${query}"`);
    
    const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: ragStoreName, query })
    });

    if (!res.ok) {
        console.error("❌ Error en /chat:", await res.text());
        return { text: "Error de conexión con el cerebro.", groundingChunks: [] };
    }
    
    const data = await res.json();
    
    console.log(`✅ Respuesta recibida (RAG: ${data.usedRAG ? 'SÍ' : 'NO'})`);
    if (data.warning) console.warn(`⚠️ ${data.warning}`);
    
    return {
        text: data.text,
        groundingChunks: data.groundingChunks || []
    };
}

export async function generateExampleQuestions(ragStoreName: string): Promise<string[]> {
    return ["¿Qué dice el documento?", "¿Resumen breve?", "¿Ideas principales?"];
}
