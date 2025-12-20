import { GoogleGenAI } from "@google/genai";

interface Env {
  DB_USUARIOS: KVNamespace;
  GEMINI_API_KEY: string;
  TELEGRAM_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    try {
      const update: any = await request.json();

      // Ignorar mensajes que no sean de texto
      if (!update.message || !update.message.text) {
        return new Response("OK");
      }

      const chatId = update.message.chat.id.toString();
      const userText = update.message.text;

      // 1. Intentar obtener el ID de la base de conocimiento desde Cloudflare KV
      let ragStoreName = await env.DB_USUARIOS.get(chatId);

      // Si es el primer mensaje y no hay base, o el usuario envía /start
      if (!ragStoreName) {
        await sendToTelegram(env, chatId, "¡Hola! Aún no tienes una base de conocimiento vinculada. Por favor, sube tus documentos primero a través de la web del SaaS.");
        return new Response("OK");
      }

      // 2. Comunicarse con Gemini usando la base de conocimiento
      const ai = new GoogleGenAI(env.GEMINI_API_KEY);
      const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });

      // Enviamos el mensaje con la herramienta de búsqueda de archivos
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: userText }] }],
        tools: [
          {
            fileSearch: {
              fileSearchStoreNames: [ragStoreName],
            },
          } as any, // Cast temporal por limitaciones de tipos en algunas versiones
        ],
      });

      const responseText = result.response.text();

      // 3. Enviar la respuesta de vuelta a Telegram
      await sendToTelegram(env, chatId, responseText);

      return new Response("OK");
    } catch (error: any) {
      console.error("Error procesando el webhook:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
};

// Función auxiliar para enviar mensajes a Telegram
async function sendToTelegram(env: Env, chatId: string, text: string) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: "Markdown",
    }),
  });
}
