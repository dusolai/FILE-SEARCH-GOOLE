import { QueryResult } from '../types';

// =================================================================
// 🚀 URL DEL BACKEND (CÁMBIALA SI CAMBIA TU CLOUD RUN)
// =================================================================
const API_BASE = "https://backend-cerebro-987192214624.europe-southwest1.run.app"; 

export function initialize() {
    console.log(`🚀 Conectado a: ${API_BASE}`);
}

function getMimeType(file: File): string {
    return file.type || 'text/plain';
}

export async function createRagStore(displayName: string): Promise<string> {
    // El backend ahora acepta 'name' o 'displayName', enviamos displayName
    const res = await fetch(`${API_BASE}/create-store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName })
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.name; // El backend devuelve { name: "store-..." }
}

export async function uploadToRagStore(ragStoreName: string, file: File): Promise<void> {
    console.log(`📤 Procesando ${file.name}...`);
    
    const formData = new FormData();
    formData.append("file", file);

    // PASO 1: Subir y EXTRAER texto
    const uploadRes = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData
    });

    if (!uploadRes.ok) throw new Error(await uploadRes.text());
    
    const uploadData = await uploadRes.json();
    const text = uploadData.file.extractedText;

    if (!text || text.length < 10) {
        throw new Error("El archivo parece estar vacío o no se pudo leer el texto.");
    }
    
    console.log(`✅ Texto extraído: ${text.length} caracteres`);
    
    // PASO 2: Guardar en la memoria del servidor
    await fetch(`${API_BASE}/link-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            storeId: ragStoreName, 
            fileName: file.name,
            extractedText: text 
        })
    });
    
    console.log("🔗 Archivo vinculado a la memoria.");
}

export async function fileSearch(ragStoreName: string, query: string): Promise<QueryResult> {
    const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: ragStoreName, query })
    });

    if (!res.ok) return { text: "Error comunicando con el servidor.", groundingChunks: [] };
    
    const data = await res.json();
    // El backend ahora devuelve { text: "..." }
    return {
        text: data.text || data.response || "Sin respuesta.",
        groundingChunks: []
    };
}

export async function generateExampleQuestions(): Promise<string[]> {
    return ["¿Resumen del documento?", "¿Puntos clave?", "¿De qué trata?"];
}
