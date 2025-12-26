/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI } from "@google/genai";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Headers CORS
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: "Falta configuración GEMINI_API_KEY" }), { 
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
      
      const storeId = response.name || response.newFileSearchStore?.name || response.fileSearchStore?.name;
      
      return new Response(JSON.stringify({ name: storeId }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // --- 2. SUBIR ARCHIVO ---
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

    // --- 3. VINCULAR ARCHIVO (REST API BLINDADA) ---
    if (url.pathname.endsWith("/link-file") && request.method === "POST") {
      const { storeId, fileId } = await request.json();
      
      // 1. Limpieza de ID más segura (toma lo que hay después del último /)
      const storeIdParts = storeId.split("/");
      const cleanStoreId = storeIdParts[storeIdParts.length - 1].trim();
      
      // 2. Espera de seguridad (Propagación)
      await new Promise(r => setTimeout(r, 2000));

      // 3. URL con Key incluida para evitar errores de enrutado
      const linkUrl = `https://generativelanguage.googleapis.com/v1beta/fileSearchStores/${cleanStoreId}/files?key=${env.GEMINI_API_KEY}`;

      console.log(`Backend: Vinculando ${fileId} en ${cleanStoreId}`);

      const linkRes = await fetch(linkUrl, {
          method: "POST",
          headers: { 
              "Content-Type": "application/json"
              // La key ya va en la URL, pero la dejamos en header por si acaso
          },
          body: JSON.stringify({ file: fileId })
      });

      if (!linkRes.ok) {
          const errText = await linkRes.text();
          console.error(`Backend Error Google: ${errText}`);
          // Devolvemos el error exacto de Google al frontend
          throw new Error(`Google (${linkRes.status}): ${errText}`);
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

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
}
