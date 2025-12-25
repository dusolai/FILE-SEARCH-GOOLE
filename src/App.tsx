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
    const [status, setStatus] = useState<AppStatus>(AppStatus.Initializing);
    const [isApiKeySelected, setIsApiKeySelected] = useState(false);
    const [apiKeyError, setApiKeyError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<{ current: number, total: number, message?: string, fileName?: string } | null>(null);
    
    // PERSISTENCIA
    const [activeRagStoreName, setActiveRagStoreName] = useState<string | null>(
        localStorage.getItem('master_rag_store_id')
    );
    
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [isQueryLoading, setIsQueryLoading] = useState(false);
    const [exampleQuestions, setExampleQuestions] = useState<string[]>([]);
    const [documentName, setDocumentName] = useState<string>('Memoria Maestra');
    const [files, setFiles] = useState<File[]>([]);
    const ragStoreNameRef = useRef(activeRagStoreName);

    useEffect(() => {
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) {
            geminiService.initialize(savedKey);
            setIsApiKeySelected(true);
        }
        setStatus(AppStatus.Welcome);
    }, []);

    useEffect(() => {
        ragStoreNameRef.current = activeRagStoreName;
        if (activeRagStoreName) {
            localStorage.setItem('master_rag_store_id', activeRagStoreName);
        }
    }, [activeRagStoreName]);

    const handleApiKeySet = (key: string) => {
        try {
            const cleanKey = key.trim(); // Limpieza clave
            localStorage.setItem('gemini_api_key', cleanKey);
            geminiService.initialize(cleanKey);
            setIsApiKeySelected(true);
            setApiKeyError(null);
        } catch (e) {
            console.error(e);
            setApiKeyError("La clave no es válida.");
        }
    };

    const handleError = (message: string, err: any) => {
        console.error(message, err);
        setError(`${message} ${err instanceof Error ? err.message : String(err)}`);
        setStatus(AppStatus.Error);
    };

    const clearError = () => {
        setError(null);
        setStatus(AppStatus.Welcome);
    }

    const handleUploadAndStartChat = async () => {
        if (!isApiKeySelected) {
            setApiKeyError("⚠️ Conecta tu API Key primero.");
            return;
        }
        if (files.length === 0) return;
        
        setStatus(AppStatus.Uploading);

        try {
            const savedKey = localStorage.getItem('gemini_api_key');
            if (savedKey) geminiService.initialize(savedKey);

            let storeName = activeRagStoreName;

            // Siempre creamos uno nuevo o usamos el existente
            if (!storeName) {
                setUploadProgress({ current: 0, total: files.length + 1, message: "Creando Cerebro en la Nube..." });
                const nuevoId = `CEREBRO_DIEGO_${Date.now()}`;
                storeName = await geminiService.createRagStore(nuevoId);
                setActiveRagStoreName(storeName);
            }

            const totalSteps = files.length + 1;

            for (let i = 0; i < files.length; i++) {
                setUploadProgress({ 
                    current: i + 1, 
                    total: totalSteps, 
                    message: `Analizando ${files[i].name}...`, 
                    fileName: files[i].name 
                });
                await geminiService.uploadToRagStore(storeName, files[i]);
            }
            
            setUploadProgress({ current: totalSteps, total: totalSteps, message: "Finalizando integración..." });
            
            try {
                const questions = await geminiService.generateExampleQuestions(storeName);
                setExampleQuestions(questions);
            } catch (e) {
                console.warn("Skip questions", e);
            }

            setDocumentName("Cerebro Diego V1");
            setStatus(AppStatus.Chatting);
            setFiles([]); 
        } catch (err) {
            handleError("Error en la subida. Verifica tu API Key.", err);
        } finally {
            setUploadProgress(null);
        }
    };

    const handleEndChat = () => {
        setChatHistory([]);
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
            const errorMessage: ChatMessage = {
                role: 'model',
                parts: [{ text: "Error de conexión con Gemini." }]
            };
            setChatHistory(prev => [...prev, errorMessage]);
        } finally {
            setIsQueryLoading(false);
        }
    };
    
    const renderContent = () => {
        switch(status) {
            case AppStatus.Initializing:
                return <div className="flex items-center justify-center h-screen bg-gray-900 text-white"><Spinner /></div>;
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
                    // CRÍTICO: Pasamos el ID para mostrarlo
                    ragStoreId={activeRagStoreName || ''} 
                />;
            case AppStatus.Error:
                 return (
                    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-red-500 p-8 text-center">
                        <h1 className="text-3xl font-bold mb-4">Error</h1>
                        <p className="mb-8">{error}</p>
                        <button onClick={clearError} className="px-6 py-3 bg-blue-600 rounded text-white">Reintentar</button>
                    </div>
                );
            default: return null;
        }
    }

    return <main className="h-screen bg-gray-900 text-white font-sans">{renderContent()}</main>;
};

export default App;