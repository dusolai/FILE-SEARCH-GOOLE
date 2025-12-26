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
    // ESTADO DE LA APP
    const [status, setStatus] = useState<AppStatus>(AppStatus.Initializing);
    const [isApiKeySelected, setIsApiKeySelected] = useState(false);
    const [apiKeyError, setApiKeyError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<{ current: number, total: number, message?: string, fileName?: string } | null>(null);
    
    // PERSISTENCIA (Para no perder el cerebro al recargar)
    const [activeRagStoreName, setActiveRagStoreName] = useState<string | null>(
        localStorage.getItem('master_rag_store_id')
    );
    
    // CHAT
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [isQueryLoading, setIsQueryLoading] = useState(false);
    const [exampleQuestions, setExampleQuestions] = useState<string[]>([]);
    const [documentName, setDocumentName] = useState<string>('Memoria Maestra');
    const [files, setFiles] = useState<File[]>([]);
    const ragStoreNameRef = useRef(activeRagStoreName);

    // 1. INICIO: Cargar clave guardada
    useEffect(() => {
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) {
            geminiService.initialize(savedKey);
            setIsApiKeySelected(true);
        }
        setStatus(AppStatus.Welcome);
    }, []);

    // 2. EFECTO: Guardar ID del cerebro si cambia
    useEffect(() => {
        ragStoreNameRef.current = activeRagStoreName;
        if (activeRagStoreName) {
            localStorage.setItem('master_rag_store_id', activeRagStoreName);
        }
    }, [activeRagStoreName]);

    // 3. GESTIÓN DE CLAVE (Desde la pantalla de bienvenida)
    const handleApiKeySet = (key: string) => {
        try {
            const cleanKey = key.trim();
            if (!cleanKey.startsWith("AIza")) throw new Error("La clave debe empezar por 'AIza'");
            
            localStorage.setItem('gemini_api_key', cleanKey);
            geminiService.initialize(cleanKey);
            
            setIsApiKeySelected(true);
            setApiKeyError(null);
        } catch (e: any) {
            setApiKeyError(e.message);
        }
    };

    const handleError = (message: string, err: any) => {
        console.error("🔥 APP ERROR:", message, err);
        const detail = err instanceof Error ? err.message : JSON.stringify(err);
        setError(`${message} -> ${detail}`);
        setStatus(AppStatus.Error);
    };

    const clearError = () => {
        setError(null);
        setStatus(AppStatus.Welcome);
    }

    // 4. LÓGICA PRINCIPAL: SUBIR ARCHIVOS
    const handleUploadAndStartChat = async () => {
        if (!isApiKeySelected) {
            setApiKeyError("⚠️ Falta la API Key.");
            return;
        }
        if (files.length === 0) return;
        
        setStatus(AppStatus.Uploading);

        try {
            // Asegurar inicialización
            const savedKey = localStorage.getItem('gemini_api_key');
            if (savedKey) geminiService.initialize(savedKey);

            let storeName = activeRagStoreName;

            // CREAR CEREBRO (Si no existe uno previo)
            if (!storeName) {
                setUploadProgress({ current: 0, total: files.length + 1, message: "Creando Cerebro en Google..." });
                const nuevoId = `CEREBRO_DIEGO_${Date.now()}`;
                storeName = await geminiService.createRagStore(nuevoId);
                setActiveRagStoreName(storeName);
            }

            const totalSteps = files.length + 1;

            // SUBIR CADA ARCHIVO
            for (let i = 0; i < files.length; i++) {
                setUploadProgress({ 
                    current: i + 1, 
                    total: totalSteps, 
                    message: `Procesando ${files[i].name}...`, 
                    fileName: files[i].name 
                });
                await geminiService.uploadToRagStore(storeName, files[i]);
            }
            
            // FINALIZAR
            setUploadProgress({ current: totalSteps, total: totalSteps, message: "Generando preguntas..." });
            try {
                const qs = await geminiService.generateExampleQuestions(storeName);
                setExampleQuestions(qs);
            } catch (e) {
                console.warn("Error generando preguntas (no crítico)", e);
            }

            setDocumentName("Cerebro Diego V1");
            setStatus(AppStatus.Chatting);
            setFiles([]); 
        } catch (err) {
            handleError("Error durante la creación de la memoria.", err);
        } finally {
            setUploadProgress(null);
        }
    };

    const handleEndChat = () => setChatHistory([]);

    const handleSendMessage = async (message: string) => {
        if (!activeRagStoreName) return;

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
            setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: "Error de conexión." }] }]);
        } finally {
            setIsQueryLoading(false);
        }
    };
    
    // RENDERIZADO
    const renderContent = () => {
        switch(status) {
            case AppStatus.Initializing:
                return <div className="flex h-screen items-center justify-center bg-gray-900 text-white"><Spinner /> Cargando...</div>;
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
                    message={uploadProgress?.message || "Iniciando..."} 
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
                        <h1 className="text-3xl font-bold mb-4">Error Crítico</h1>
                        <div className="bg-black/30 p-4 rounded text-left mb-6 max-w-2xl overflow-auto max-h-40 font-mono text-sm border border-red-800">
                            {error}
                        </div>
                        <button onClick={clearError} className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-500">Volver a intentar</button>
                    </div>
                );
            default: return null;
        }
    }

    return <main className="h-screen bg-gray-900 text-white font-sans">{renderContent()}</main>;
};

export default App;
