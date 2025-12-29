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
    
    // --- PERSISTENCIA DE SESIÓN ---
    const [activeRagStoreName, setActiveRagStoreName] = useState<string | null>(
        localStorage.getItem('master_rag_store_id')
    );
    
    // --- PERSISTENCIA DE CHAT (NUEVO) ---
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => {
        const saved = localStorage.getItem('chat_history');
        return saved ? JSON.parse(saved) : [];
    });

    const [isQueryLoading, setIsQueryLoading] = useState(false);
    const [exampleQuestions, setExampleQuestions] = useState<string[]>([]);
    const [documentName, setDocumentName] = useState<string>('Memoria Maestra');
    const [files, setFiles] = useState<File[]>([]);

    // Guardar Chat cada vez que cambia
    useEffect(() => {
        localStorage.setItem('chat_history', JSON.stringify(chatHistory));
    }, [chatHistory]);

    // Guardar ID del Store
    useEffect(() => {
        if (activeRagStoreName) {
            localStorage.setItem('master_rag_store_id', activeRagStoreName);
            // Si hay ID y Chat guardado, vamos directo al chat
            if (chatHistory.length > 0 && status === AppStatus.Initializing) {
                setStatus(AppStatus.Chatting);
            }
        }
    }, [activeRagStoreName, chatHistory, status]);

    // Cargar API Key
    useEffect(() => {
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) {
            geminiService.initialize(savedKey);
            setIsApiKeySelected(true);
        }
        // Si no hemos saltado al chat ya, vamos a Welcome
        if (status === AppStatus.Initializing && (!activeRagStoreName || chatHistory.length === 0)) {
            setStatus(AppStatus.Welcome);
        }
    }, [status, activeRagStoreName, chatHistory.length]);

    const handleApiKeySet = (key: string) => {
        localStorage.setItem('gemini_api_key', key);
        geminiService.initialize(key);
        setIsApiKeySelected(true);
    };

    const handleUploadAndStartChat = async () => {
        if (!isApiKeySelected) return setApiKeyError("Falta API Key");
        setStatus(AppStatus.Uploading);

        try {
            let storeName = activeRagStoreName;
            if (!storeName) {
                const nuevoId = `cerebro_${Date.now()}`;
                storeName = await geminiService.createRagStore(nuevoId);
                setActiveRagStoreName(storeName);
            }

            for (let i = 0; i < files.length; i++) {
                setUploadProgress({ current: i + 1, total: files.length, message: `Subiendo ${files[i].name}...` });
                await geminiService.uploadToRagStore(storeName, files[i]);
            }
            
            setStatus(AppStatus.Chatting);
            setFiles([]); 
        } catch (err: any) {
            setError(err.message);
            setStatus(AppStatus.Error);
        } finally {
            setUploadProgress(null);
        }
    };

    const handleEndChat = () => {
        if (window.confirm("¿Seguro? Esto borrará el historial visual (la memoria del cerebro sigue intacta).")) {
            setChatHistory([]);
            localStorage.removeItem('chat_history');
            // Opcional: localStorage.removeItem('master_rag_store_id');
            // Opcional: setActiveRagStoreName(null);
            setStatus(AppStatus.Welcome);
        }
    };

    const handleSendMessage = async (message: string) => {
        if (!activeRagStoreName) return;
        const userMsg: ChatMessage = { role: 'user', parts: [{ text: message }] };
        setChatHistory(prev => [...prev, userMsg]);
        setIsQueryLoading(true);

        try {
            const result = await geminiService.fileSearch(activeRagStoreName, message);
            setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: result.text }] }]);
        } catch (err) {
            setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: "Error de conexión." }] }]);
        } finally {
            setIsQueryLoading(false);
        }
    };

    // Renderizado simplificado para brevedad
    if (status === AppStatus.Initializing) return <div className="h-screen bg-gray-900 flex items-center justify-center text-white"><Spinner /></div>;
    if (status === AppStatus.Error) return <div className="h-screen bg-gray-900 flex flex-col items-center justify-center text-red-500"><p>{error}</p><button onClick={() => setStatus(AppStatus.Welcome)} className="mt-4 bg-blue-600 text-white p-2 rounded">Reintentar</button></div>;
    if (status === AppStatus.Chatting) return <ChatInterface documentName={documentName} history={chatHistory} isQueryLoading={isQueryLoading} onSendMessage={handleSendMessage} onNewChat={handleEndChat} exampleQuestions={exampleQuestions} ragStoreId={activeRagStoreName || ''} />;
    if (status === AppStatus.Uploading) return <ProgressBar progress={uploadProgress?.current || 0} total={uploadProgress?.total || 100} message={uploadProgress?.message || "Cargando..."} />;

    return <WelcomeScreen onUpload={handleUploadAndStartChat} apiKeyError={apiKeyError} files={files} setFiles={setFiles} isApiKeySelected={isApiKeySelected} onApiKeySet={handleApiKeySet} />;
};

export default App;
