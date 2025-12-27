/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI } from "@google/genai";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Headers CORS para permitir que tu frontend hable con el backend
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: "Falta configuración GEMINI_API_KEY en .env.local" }), { 
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

    // --- 1. CREAR CEREBRO ---
    if (url.pathname.endsWith("/create-store") && request.method === "POST") {
      const { displayName } = await request.json();
      
      const response = await ai.fileSearchStores.create({ 
          fileSearchStore: { displayName: displayName } 
      });
      
      // Manejo robusto de la respuesta de Google
      const storeId = response.name || response.newFileSearchStore?.name || response.fileSearchStore?.name;
      
      return new Response(JSON.stringify({ name: storeId }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // --- 2. SUBIR ARCHIVO (CORREGIDO) ---
    if (url.pathname.endsWith("/upload") && request.method === "POST") {
      const formData = await request.formData();
      const file = formData.get("file");
      const mimeType = formData.get("mimeType");
      // Leemos el nombre que enviamos explícitamente desde el frontend
      const displayName = formData.get("displayName") || "archivo_sin_nombre.txt";

      // VALIDACIÓN DE SEGURIDAD
      if (!file) {
        throw new Error("El archivo llegó vacío al servidor.");
      }

      const uploadResponse = await ai.files.upload({
          file: file,
          config: { 
              // Usamos el nombre explícito para evitar el error 'reading name of undefined'
              displayName: displayName.toString(), 
              mimeType: mimeType ? mimeType.toString() : "text/plain" 
          }
      });

      return new Response(JSON.stringify(uploadResponse), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // --- 3. VINCULAR ARCHIVO ---
    if (url.pathname.endsWith("/link-file") && request.method === "POST") {
      const { storeId, fileId } = await request.json();
      
      const storeIdParts = storeId.split("/");
      const cleanStoreId = storeIdParts[storeIdParts.length - 1].trim();
      
      // Espera técnica para dar tiempo a Google a procesar el archivo
      await new Promise(r => setTimeout(r, 2000));

      const linkUrl = `https://generativelanguage.googleapis.com/v1beta/fileSearchStores/${cleanStoreId}/files?key=${env.GEMINI_API_KEY}`;

      const linkRes = await fetch(linkUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: fileId })
      });

      if (!linkRes.ok) {
          const errText = await linkRes.text();
          throw new Error(`Google Error (${linkRes.status}): ${errText}`);
      }

      const data = await linkRes.json();
      return new Response(JSON.stringify(data), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // --- 4. CHAT ---
    if (url.pathname.endsWith("/chat") && request.method === "POST") {
      const { storeId, query } = await request.json();
      const model = ai.getGenerativeModel({ 
          model: "gemini-1.5-flash",
          tools: [{ fileSearch: { fileSearchStoreNames: [storeId] } }]
      });

      const result = await model.generateContent(query);
      const chunks = result.response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

      return new Response(JSON.stringify({ 
          text: result.response.text(),
          groundingChunks: chunks
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response("Ruta no encontrada", { status: 404, headers: corsHeaders });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
}