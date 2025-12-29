import React, { useState, useEffect, useRef } from 'react';
import { AppStatus, ChatMessage } from './types';
import * as geminiService from './services/geminiService';
import Spinner from './components/Spinner';
import WelcomeScreen from './components/WelcomeScreen';
import ProgressBar from './components/ProgressBar';
import ChatInterface from './components/ChatInterface';

const App: React.FC = () => {
    const [status, setStatus] = useState<AppStatus>(AppStatus.Initializing);
    const [isApiKeySelected, setIsApiKeySelected] = useState(false);
    const [apiKeyError, setApiKeyError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<any>(null);
    
    // --- PERSISTENCIA ---
    const [activeRagStoreName, setActiveRagStoreName] = useState<string | null>(
        localStorage.getItem('master_rag_store_id')
    );
    
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => {
        const saved = localStorage.getItem('chat_history');
        return saved ? JSON.parse(saved) : [];
    });

    const [isQueryLoading, setIsQueryLoading] = useState(false);
    const [exampleQuestions, setExampleQuestions] = useState<string[]>([]);
    const [documentName, setDocumentName] = useState<string>('Memoria Maestra');
    const [files, setFiles] = useState<File[]>([]);
    const ragStoreNameRef = useRef(activeRagStoreName);

    // Guardar historial al cambiar
    useEffect(() => {
        localStorage.setItem('chat_history', JSON.stringify(chatHistory));
    }, [chatHistory]);

    // INICIO: LÓGICA CORREGIDA
    useEffect(() => {
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) {
            geminiService.initialize(savedKey);
            setIsApiKeySelected(true);
        }

        // --- CORRECCIÓN CLAVE AQUÍ ---
        // Antes exigíamos (store && history.length > 0).
        // Ahora solo exigimos (store). Si tienes cerebro, vas al chat.
        if (activeRagStoreName) {
            console.log("Cerebro detectado, restaurando sesión...");
            setStatus(AppStatus.Chatting);
        } else {
            setStatus(AppStatus.Welcome);
        }
    }, []); 

    // Guardar ID del Store
    useEffect(() => {
        ragStoreNameRef.current = activeRagStoreName;
        if (activeRagStoreName) {
            localStorage.setItem('master_rag_store_id', activeRagStoreName);
        }
    }, [activeRagStoreName]);

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
        console.error("APP ERROR:", message, err);
        const detail = err instanceof Error ? err.message : JSON.stringify(err);
        setError(`${message} -> ${detail}`);
        setStatus(AppStatus.Error);
    };

    const clearError = () => {
        setError(null);
        setStatus(AppStatus.Welcome);
    }

    const handleUploadAndStartChat = async () => {
        if (!isApiKeySelected) {
            setApiKeyError("⚠️ Falta la API Key.");
            return;
        }
        if (files.length === 0) return;
        
        setStatus(AppStatus.Uploading);

        try {
            const savedKey = localStorage.getItem('gemini_api_key');
            if (savedKey) geminiService.initialize(savedKey);

            let storeName = activeRagStoreName;

            if (!storeName) {
                setUploadProgress({ current: 0, total: files.length + 1, message: "Creando Cerebro..." });
                const nuevoId = `CEREBRO_DIEGO_${Date.now()}`;
                storeName = await geminiService.createRagStore(nuevoId);
                setActiveRagStoreName(storeName);
            }

            const totalSteps = files.length + 1;

            for (let i = 0; i < files.length; i++) {
                setUploadProgress({ 
                    current: i + 1, 
                    total: totalSteps, 
                    message: `Subiendo ${files[i].name}...`, 
                    fileName: files[i].name 
                });
                await geminiService.uploadToRagStore(storeName, files[i]);
            }
            
            setUploadProgress({ current: totalSteps, total: totalSteps, message: "Finalizando..." });
            
            setDocumentName("Cerebro Diego V1");
            setStatus(AppStatus.Chatting);
            setFiles([]); 
        } catch (err) {
            handleError("Error creando memoria", err);
        } finally {
            setUploadProgress(null);
        }
    };

    const handleEndChat = () => {
        if (window.confirm("¿Borrar memoria local? (La del servidor sigue existiendo)")) {
            setChatHistory([]);
            setActiveRagStoreName(null);
            localStorage.removeItem('chat_history');
            localStorage.removeItem('master_rag_store_id');
            setStatus(AppStatus.Welcome);
        }
    };

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
    
    // RENDER
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
                        <button onClick={clearError} className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-500">Reintentar</button>
                    </div>
                );
            default: return null;
        }
    }

    return <main className="h-screen bg-gray-900 text-white font-sans">{renderContent()}</main>;
};

export default App;
