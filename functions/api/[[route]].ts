/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI } from "@google/genai";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // CORS Headers (Para permitir peticiones)
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Manejar preflight (peticiones de chequeo del navegador)
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Verificar que tenemos la API Key
  if (!env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: "Falta configuración GEMINI_API_KEY en Cloudflare" }), { 
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

    // --- RUTAS DE LA API ---

    // 1. CREAR CEREBRO
    if (url.pathname.endsWith("/create-store") && request.method === "POST") {
      const { displayName } = await request.json();
      const response = await ai.fileSearchStores.create({ config: { displayName } });
      // Extraemos el ID con seguridad
      const storeId = response.name || response.newFileSearchStore?.name || response.fileSearchStore?.name;
      
      return new Response(JSON.stringify({ name: storeId }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // 2. SUBIR ARCHIVO
    if (url.pathname.endsWith("/upload") && request.method === "POST") {
      const formData = await request.formData();
      const file = formData.get("file");
      const mimeType = formData.get("mimeType");

      const uploadResponse = await ai.files.upload({
          file: file,
          config: { displayName: file.name, mimeType: mimeType }
      });

      return new Response(JSON.stringify(uploadResponse), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // 3. VINCULAR ARCHIVO (REST MANUAL PARA EVITAR BUG DEL SDK)
    if (url.pathname.endsWith("/link-file") && request.method === "POST") {
      const { storeId, fileId } = await request.json();
      const cleanStoreId = storeId.replace("fileSearchStores/", "");
      
      // Llamada directa a la API REST de Google
      const linkUrl = `https://generativelanguage.googleapis.com/v1beta/fileSearchStores/${cleanStoreId}/files?key=${env.GEMINI_API_KEY}`;
      
      const linkRes = await fetch(linkUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: fileId })
      });

      if (!linkRes.ok) {
          const errText = await linkRes.text();
          throw new Error(`Google API Error (${linkRes.status}): ${errText}`);
      }

      const data = await linkRes.json();
      return new Response(JSON.stringify(data), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // 4. CHAT
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

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
}
