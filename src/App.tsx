/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useRef } from 'react';
import { AppStatus, ChatMessage } from './types';
import * as geminiService from './services/geminiService';
import Spinner from './components/Spinner';
import WelcomeScreen from './components/WelcomeScreen';
import ProgressBar from './components/ProgressBar';
import ChatInterface from './components/ChatInterface';

const App: React.FC = () => {
    console.log("🔄 App: Renderizando componente..."); // LOG DEBUG

    const [status, setStatus] = useState<AppStatus>(AppStatus.Initializing);
    const [isApiKeySelected, setIsApiKeySelected] = useState(false);
    const [apiKeyError, setApiKeyError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<{ current: number, total: number, message?: string, fileName?: string } | null>(null);
    
    // Recuperar datos guardados
    const [activeRagStoreName, setActiveRagStoreName] = useState<string | null>(
        localStorage.getItem('master_rag_store_id')
    );
    
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [isQueryLoading, setIsQueryLoading] = useState(false);
    const [exampleQuestions, setExampleQuestions] = useState<string[]>([]);
    const [documentName, setDocumentName] = useState<string>('Memoria Maestra');
    const [files, setFiles] = useState<File[]>([]);
    const ragStoreNameRef = useRef(activeRagStoreName);

    // Inicialización
    useEffect(() => {
        console.log("🚀 App: Iniciando efecto de carga...");
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) {
            console.log("🔑 App: Clave encontrada en localStorage.");
            try {
                geminiService.initialize(savedKey);
                setIsApiKeySelected(true);
            } catch (e) {
                console.error("❌ App: Error al inicializar con clave guardada:", e);
            }
        } else {
            console.log("ℹ️ App: No hay clave guardada.");
        }
        setStatus(AppStatus.Welcome);
    }, []);

    // Guardar ID del store si cambia
    useEffect(() => {
        if (activeRagStoreName) {
            console.log("💾 App: Guardando Store ID:", activeRagStoreName);
            localStorage.setItem('master_rag_store_id', activeRagStoreName);
        }
    }, [activeRagStoreName]);

    // MANEJADOR DE LA CLAVE (Aquí es donde suele fallar si "no hace nada")
    const handleApiKeySet = (key: string) => {
        console.log("🖱️ App: handleApiKeySet llamado con clave:", key ? "****" : "vacía");
        try {
            const cleanKey = key.trim();
            if (!cleanKey.startsWith("AIza")) {
                throw new Error("La clave no empieza por 'AIza'.");
            }
            
            localStorage.setItem('gemini_api_key', cleanKey);
            geminiService.initialize(cleanKey); // Esto puede lanzar error
            
            console.log("✅ App: Clave inicializada correctamente.");
            setIsApiKeySelected(true);
            setApiKeyError(null);
        } catch (e) {
            console.error("❌ App: Error configurando clave:", e);
            setApiKeyError(e instanceof Error ? e.message : "Clave inválida");
            setIsApiKeySelected(false);
        }
    };

    const handleError = (message: string, err: any) => {
        console.error("🔥 App Error:", message, err);
        setError(`${message} ${err instanceof Error ? err.message : String(err)}`);
        setStatus(AppStatus.Error);
    };

    const clearError = () => {
        setError(null);
        setStatus(AppStatus.Welcome);
    }

    const handleUploadAndStartChat = async () => {
        console.log("📤 App: handleUploadAndStartChat iniciado.");
        
        if (!isApiKeySelected) {
            console.warn("⚠️ App: Intento de subida sin API Key.");
            setApiKeyError("⚠️ Conecta tu API Key primero.");
            return;
        }
        if (files.length === 0) {
            console.warn("⚠️ App: Intento de subida sin archivos.");
            return;
        }
        
        setStatus(AppStatus.Uploading);

        try {
            let storeName = activeRagStoreName;
            
            // Crear Store si no existe
            if (!storeName) {
                const nuevoId = `CEREBRO_DIEGO_${Date.now()}`;
                console.log("🔨 App: Creando nuevo store:", nuevoId);
                setUploadProgress({ current: 0, total: files.length + 1, message: "Creando Cerebro..." });
                storeName = await geminiService.createRagStore(nuevoId);
                setActiveRagStoreName(storeName);
            } else {
                console.log("♻️ App: Usando store existente:", storeName);
            }

            const totalSteps = files.length + 1;

            // Subir archivos
            for (let i = 0; i < files.length; i++) {
                console.log(`📤 App: Subiendo archivo ${i+1}/${files.length}: ${files[i].name}`);
                setUploadProgress({ 
                    current: i + 1, 
                    total: totalSteps, 
                    message: `Analizando ${files[i].name}...`, 
                    fileName: files[i].name 
                });
                await geminiService.uploadToRagStore(storeName, files[i]);
            }
            
            // Generar preguntas
            setUploadProgress({ current: totalSteps, total: totalSteps, message: "Finalizando..." });
            try {
                const questions = await geminiService.generateExampleQuestions(storeName);
                setExampleQuestions(questions);
            } catch (e) {
                console.warn("⚠️ App: Fallo al generar preguntas (no crítico).", e);
            }

            setDocumentName("Cerebro Diego V1");
            setStatus(AppStatus.Chatting);
            setFiles([]); 
        } catch (err) {
            handleError("Error crítico en la subida.", err);
        } finally {
            setUploadProgress(null);
        }
    };

    const handleEndChat = () => setChatHistory([]);

    const handleSendMessage = async (message: string) => {
        if (!activeRagStoreName) return;
        console.log("💬 App: Enviando mensaje:", message);

        const userMessage: ChatMessage = { role: 'user', parts: [{ text: message }] };
        setChatHistory(prev => [...prev, userMessage]);
        setIsQueryLoading(true);

        try {
            const result = await geminiService.fileSearch(activeRagStoreName, message);
            const modelMessage: ChatMessage = {
                role: 'model',
                parts: [{ text: result.text }],
                groundingChunks: result.groundingChunks
            };
            setChatHistory(prev => [...prev, modelMessage]);
        } catch (err) {
            console.error("❌ App: Error en chat:", err);
            setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: "Error de conexión." }] }]);
        } finally {
            setIsQueryLoading(false);
        }
    };
    
    // RENDERIZADO
    const renderContent = () => {
        switch(status) {
            case AppStatus.Initializing:
                return <div className="flex h-screen items-center justify-center bg-gray-900 text-white">Cargando...</div>;
            case AppStatus.Welcome:
                 return <WelcomeScreen 
                        onUpload={handleUploadAndStartChat} 
                        apiKeyError={apiKeyError} 
                        files={files} 
                        setFiles={setFiles} 
                        isApiKeySelected={isApiKeySelected} 
                        onApiKeySet={handleApiKeySet} 
                    />;
            case AppStatus.Uploading:
                return <ProgressBar 
                    progress={uploadProgress?.current || 0} 
                    total={uploadProgress?.total || 1} 
                    message={uploadProgress?.message || "Procesando..."} 
                    fileName={uploadProgress?.fileName}
                />;
            case AppStatus.Chatting:
                return <ChatInterface 
                    documentName={documentName}
                    history={chatHistory}
                    isQueryLoading={isQueryLoading}
                    onSendMessage={handleSendMessage}
                    onNewChat={handleEndChat}
                    exampleQuestions={exampleQuestions}
                    ragStoreId={activeRagStoreName || ''} 
                />;
            case AppStatus.Error:
                 return (
                    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-red-500 p-8 text-center">
                        <h1 className="text-3xl font-bold">Error</h1>
                        <p>{error}</p>
                        <button onClick={clearError} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">Reintentar</button>
                    </div>
                );
            default: return null;
        }
    }

    return <main className="h-screen bg-gray-900 text-white font-sans">{renderContent()}</main>;
};

export default App;