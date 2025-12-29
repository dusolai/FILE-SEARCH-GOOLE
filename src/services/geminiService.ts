import { QueryResult } from '../types';

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
    try {
        const res = await fetch(`${API_BASE}/create-store`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ displayName })
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        return data.name;
    } catch (error: any) {
        return `store-fallback-${Date.now()}`;
    }
}

export async function uploadToRagStore(ragStoreName: string, file: File): Promise<void> {
    console.log(`📤 Procesando ${file.name}...`);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mimeType", getMimeType(file));
    formData.append("displayName", file.name);

    const uploadRes = await fetch(`${API_BASE}/upload`, { method: "POST", body: formData });
    if (!uploadRes.ok) throw new Error(await uploadRes.text());
    
    const uploadData = await uploadRes.json();
    const text = uploadData.file.extractedText;

    const linkRes = await fetch(`${API_BASE}/link-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            storeId: ragStoreName, 
            fileName: file.name,
            extractedText: text,
            googleData: uploadData.file.googleData // Enviamos los datos nativos de Google
        })
    });
    if (!linkRes.ok) throw new Error("Error guardando archivo.");
}

export async function fileSearch(ragStoreName: string, query: string): Promise<QueryResult> {
    try {
        const res = await fetch(`${API_BASE}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storeId: ragStoreName, query })
        });
        if (!res.ok) {
            return { text: "Error comunicando con el servidor.", groundingChunks: [] };
        }
        const data = await res.json();
        return {
            text: data.text || "Sin respuesta.",
            groundingChunks: data.groundingChunks || []
        };
    } catch (error: any) {
        return { text: "Error de conexión.", groundingChunks: [] };
    }
}

// NUEVO: Obtener lista de archivos
export async function listFiles(ragStoreName: string): Promise<string[]> {
    try {
        const res = await fetch(`${API_BASE}/files?storeId=${ragStoreName}`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.files || [];
    } catch (e) {
        console.error("Error fetching files:", e);
        return [];
    }
}

export async function generateExampleQuestions(ragStoreName: string): Promise<string[]> {
    return ["¿Resumen del documento?", "¿Cuáles son los puntos clave?", "¿Qué conclusiones hay?"];
}
