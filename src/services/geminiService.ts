/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { QueryResult } from '../types';

// =================================================================
// 🚀 URL DEL BACKEND
// Asegúrate de que esta es la URL de tu servicio en Cloud Run
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

/**
 * Crea un "Store" (memoria) en el backend.
 */
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
        console.error("Error creando store:", error);
        // Si falla, devolvemos un ID temporal para que la UI no se rompa
        return `store-fallback-${Date.now()}`;
    }
}

/**
 * Sube el archivo, extrae el texto y lo vincula a la memoria.
 */
export async function uploadToRagStore(ragStoreName: string, file: File): Promise<void> {
    console.log(`📤 Procesando ${file.name}...`);
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mimeType", getMimeType(file));
    formData.append("displayName", file.name);

    // PASO 1: Subir al backend y procesar (extraer texto/PDF)
    const uploadRes = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData
    });

    if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        console.error("❌ Error Backend Upload:", errorText);
        throw new Error(`Fallo en subida: ${errorText}`);
    }
    
    const uploadData = await uploadRes.json();
    const text = uploadData.file.extractedText;

    // Validación: Si no hay texto, algo falló en la lectura del PDF/Archivo
    if (!text || text.length < 5) {
        throw new Error("El archivo parece vacío o no se pudo leer el texto.");
    }
    
    console.log(`✅ Texto extraído: ${text.length} caracteres`);
    
    // PASO 2: Vincular el texto extraído a la memoria del servidor
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
        const linkError = await linkRes.text();
        console.error("❌ Error Linking:", linkError);
        throw new Error("Error guardando el archivo en memoria.");
    }
    
    console.log("🔗 Archivo vinculado correctamente.");
}

/**
 * Envía la pregunta al backend para que Gemini responda con los documentos.
 */
export async function fileSearch(ragStoreName: string, query: string): Promise<QueryResult> {
    console.log(`🔍 Preguntando: "${query}"`);
    
    try {
        const res = await fetch(`${API_BASE}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storeId: ragStoreName, query })
        });

        // CAPTURA DE ERROR REAL DEL SERVIDOR (IMPORTANTE)
        if (!res.ok) {
            let errorMessage = `Error ${res.status}: Fallo de conexión`;
            try {
                // Intentamos leer el JSON de error que manda el backend
                const errorJson = await res.json();
                errorMessage = errorJson.error || errorJson.message || JSON.stringify(errorJson);
            } catch (e) {
                // Si no es JSON, leemos el texto crudo
                errorMessage = await res.text();
            }
            console.error("❌ Error Backend Chat:", errorMessage);
            return { 
                text: `⚠️ Error del Servidor: ${errorMessage}`, 
                groundingChunks: [] 
            };
        }
        
        const data = await res.json();
        return {
            text: data.text || data.response || "Sin respuesta del modelo.",
            groundingChunks: data.groundingChunks || []
        };

    } catch (error: any) {
        console.error("❌ Error de Red/Fetch:", error);
        return { 
            text: "⚠️ No se pudo conectar con el servidor. Verifica tu internet o la URL del backend.", 
            groundingChunks: [] 
        };
    }
}

export async function generateExampleQuestions(ragStoreName: string): Promise<string[]> {
    return ["¿Resumen del documento?", "¿Cuáles son los puntos clave?", "¿Qué conclusiones hay?"];
}
