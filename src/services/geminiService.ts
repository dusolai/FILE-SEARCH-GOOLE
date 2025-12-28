import { QueryResult } from '../types';

// URL DE TU BACKEND
const API_BASE = "https://backend-cerebro-987192214624.europe-southwest1.run.app";

export function initialize() {
    console.log(`🚀 Conectado a: ${API_BASE}`);
}

function getMimeType(file: File): string {
    return file.type || 'text/plain';
}

export async function createRagStore(displayName: string): Promise<string> {
    const res = await fetch(`${API_BASE}/create-store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName })
    });
    const data = await res.json();
    return data.name;
}

export async function uploadToRagStore(ragStoreName: string, file: File): Promise<void> {
    console.log(`📤 Subiendo ${file.name}...`);
    
    const formData = new FormData();
    formData.append("file", file);
    
    // 1. Subir y Extraer
    const uploadRes = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData
    });

    if (!uploadRes.ok) throw new Error(await uploadRes.text());
    
    const uploadData = await uploadRes.json();
    const text = uploadData.file.extractedText;

    if (!text) throw new Error("No se pudo extraer texto del archivo.");

    console.log(`✅ Texto extraído: ${text.length} chars`);

    // 2. Guardar en memoria (Ahora es seguro contra reinicios)
    const linkRes = await fetch(`${API_BASE}/link-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            storeId: ragStoreName, 
            fileName: file.name,
            extractedText: text 
        })
    });

    if (!linkRes.ok) {
        // Si aún así falla, mostramos el error real
        console.error("Link Error:", await linkRes.text());
        throw new Error("Error vinculando archivo.");
    }
    
    console.log("🔗 Archivo guardado correctamente.");
}

export async function fileSearch(ragStoreName: string, query: string): Promise<QueryResult> {
    const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: ragStoreName, query })
    });

    if (!res.ok) return { text: "Error de conexión.", groundingChunks: [] };
    
    const data = await res.json();
    return {
        text: data.text || "Sin respuesta.",
        groundingChunks: []
    };
}

export async function generateExampleQuestions(): Promise<string[]> {
    return ["¿Resumen?", "¿Ideas clave?", "¿Conclusiones?"];
}
