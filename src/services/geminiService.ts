export async function uploadToRagStore(ragStoreName: string, file: File): Promise<void> {
    console.log(`📤 Subiendo ${file.name}...`);
    
    // 1. Subir Archivo
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mimeType", getMimeType(file));
    // CORRECCIÓN: Enviamos el nombre explícitamente para evitar errores en el backend
    formData.append("displayName", file.name);

    const uploadRes = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData
    });

    if (!uploadRes.ok) {
        // Intentamos leer el error con seguridad
        const text = await uploadRes.text();
        let errorMsg = text;
        try {
            const json = JSON.parse(text);
            errorMsg = json.error || text;
        } catch (e) {}
        
        throw new Error(`Fallo subida: ${errorMsg}`);
    }
    
    const fileData = await uploadRes.json();
    // A veces Google devuelve la info dentro de 'file' o 'newFile'
    const fileId = fileData.name || fileData.file?.name || fileData.newFile?.name; 
    
    if (!fileId) throw new Error("El servidor no devolvió el ID del archivo. Respuesta: " + JSON.stringify(fileData));

    console.log(`🔗 Vinculando ${fileId} a ${ragStoreName}...`);

    // 2. Vincular
    const linkRes = await fetch(`${API_BASE}/link-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: ragStoreName, fileId: fileId })
    });

    if (!linkRes.ok) {
        const err = await linkRes.json().catch(() => ({ error: linkRes.statusText }));
        throw new Error(`Fallo vinculación: ${err.error}`);
    }

    console.log("✅ Archivo listo.");
}