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
            body: JSON.stringify({ name: displayName })
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        return data.name;
    } catch (error: any) {
        console.error("Error creando store:", error);
        return `store-fallback-${Date.now()}`;
    }
}

export async function uploadToRagStore(ragStoreName: string, file: File): Promise<void> {
    console.log(`📤 Subiendo ${file.name}...`);
    
    // 1. Subir archivo al backend para procesamiento (chunking + embeddings)
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mimeType", getMimeType(file));
    formData.append("displayName", file.name);

    console.log(`⚙️ Procesando con chunking y embeddings...`);
    
    const uploadRes = await fetch(`${API_BASE}/upload`, { 
        method: "POST", 
        body: formData 
    });
    
    if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        throw new Error(`Error en upload: ${errorText}`);
    }
    
    const uploadData = await uploadRes.json();
    
    if (!uploadData.file || !uploadData.file.chunks) {
        throw new Error("El backend no devolvió chunks válidos");
    }
    
    console.log(`✅ Generados ${uploadData.file.chunkCount} chunks con embeddings`);

    // 2. Vincular los chunks al store
    console.log(`🔗 Vinculando al cerebro ${ragStoreName}...`);
    
    const linkRes = await fetch(`${API_BASE}/link-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            storeId: ragStoreName, 
            fileName: file.name,
            chunks: uploadData.file.chunks // Chunks con embeddings
        })
    });
    
    if (!linkRes.ok) {
        const errorText = await linkRes.text();
        throw new Error(`Error en link-file: ${errorText}`);
    }
    
    // Esperar un poco para asegurar que el backend terminó el guardado asíncrono
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`💾 ${file.name} vinculado correctamente`);
}

export async function fileSearch(ragStoreName: string, query: string): Promise<QueryResult> {
    try {
        console.log(`🔍 Buscando: "${query}"`);
        
        const res = await fetch(`${API_BASE}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storeId: ragStoreName, query })
        });
        
        if (!res.ok) {
            console.error("Error en chat:", res.status);
            return { text: "Error comunicando con el servidor.", groundingChunks: [] };
        }
        
        const data = await res.json();
        
        console.log(`✅ Respuesta recibida (${data.text?.length || 0} chars)`);
        
        if (data.debug) {
            console.log(`📊 Debug:`, data.debug);
        }
        
        if (data.sources) {
            console.log(`📚 Fuentes: ${data.sources.length}`);
            data.sources.forEach((src: any, i: number) => {
                console.log(`  ${i + 1}. ${src.fileName} (Score: ${src.score})`);
            });
        }
        
        return {
            text: data.text || "Sin respuesta.",
            groundingChunks: data.sources?.map((src: any) => ({
                retrievedContext: {
                    text: `[${src.fileName}, Chunk ${src.chunkIndex}] ${src.preview}`
                }
            })) || []
        };
    } catch (error: any) {
        console.error("Error en fileSearch:", error);
        return { text: "Error de conexión.", groundingChunks: [] };
    }
}

export async function listFiles(ragStoreName: string): Promise<string[]> {
    try {
        const res = await fetch(`${API_BASE}/files?storeId=${ragStoreName}`);
        if (!res.ok) {
            console.error("Error listando archivos:", res.status);
            return [];
        }
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
