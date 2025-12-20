/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppStatus, ChatMessage } from './types';
import * as geminiService from './services/geminiService';
import Spinner from './components/Spinner';
import WelcomeScreen from './components/WelcomeScreen';
import ProgressBar from './components/ProgressBar';
import ChatInterface from './components/ChatInterface';

declare global {
    interface AIStudio {
        openSelectKey: () => Promise<void>;
        hasSelectedApiKey: () => Promise<boolean>;
    }
    interface Window {
        aistudio?: AIStudio;
    }
}

const App: React.FC = () => {
    const [status, setStatus] = useState<AppStatus>(AppStatus.Initializing);
    const [isApiKeySelected, setIsApiKeySelected] = useState(false);
    const [apiKeyError, setApiKeyError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<{ current: number, total: number, message?: string, fileName?: string } | null>(null);
    
    // CAMBIO: Inicializamos desde localStorage para PERSISTENCIA
    const [activeRagStoreName, setActiveRagStoreName] = useState<string | null>(
        localStorage.getItem('master_rag_store_id')
    );
    
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [isQueryLoading, setIsQueryLoading] = useState(false);
    const [exampleQuestions, setExampleQuestions] = useState<string[]>([]);
    const [documentName, setDocumentName] = useState<string>('Base de Conocimiento Maestro');
    const [files, setFiles] = useState<File[]>([]);
    const ragStoreNameRef = useRef(activeRagStoreName);

    useEffect(() => {
        ragStoreNameRef.current = activeRagStoreName;
        // CAMBIO: Guardamos el ID siempre que cambie
        if (activeRagStoreName) {
            localStorage.setItem('master_rag_store_id', activeRagStoreName);
        }
    }, [activeRagStoreName]);
    
    const checkApiKey = useCallback(async () => {
        if (window.aistudio?.hasSelectedApiKey) {
            try {
                const hasKey = await window.aistudio.hasSelectedApiKey();
                setIsApiKeySelected(hasKey);
            } catch (e) {
                console.error("Error checking for API key:", e);
                setIsApiKeySelected(false);
            }
        }
    }, []);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkApiKey();
            }
        };
        checkApiKey();
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', checkApiKey);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', checkApiKey);
        };
    }, [checkApiKey]);

    // CAMBIO: Se ha ELIMINADO el useEffect de 'beforeunload' que borraba el store.

    const handleError = (message: string, err: any) => {
        console.error(message, err);
        setError(`${message}${err ? `: ${err instanceof Error ? err.message : String(err)}` : ''}`);
        setStatus(AppStatus.Error);
    };

    const clearError = () => {
        setError(null);
        setStatus(AppStatus.Welcome);
    }

    useEffect(() => {
        setStatus(AppStatus.Welcome);
    }, []);

    const handleSelectKey = async () => {
        if (window.aistudio?.openSelectKey) {
            try {
                await window.aistudio.openSelectKey();
                await checkApiKey();
            } catch (err) {
                console.error("Failed to open API key selection dialog", err);
            }
        }
    };

    const handleUploadAndStartChat = async () => {
        if (!isApiKeySelected) {
            setApiKeyError("Por favor, selecciona tu API Key de Gemini primero.");
            throw new Error("API Key is required.");
        }
        if (files.length === 0) return;
        
        setApiKeyError(null);

        try {
            geminiService.initialize();
        } catch (err) {
            handleError("Error de inicialización.", err);
            throw err;
        }
        
        setStatus(AppStatus.Uploading);

        try {
            let storeName = activeRagStoreName;

            // CAMBIO: Si no existe un almacén maestro, lo creamos una sola vez
            if (!storeName) {
                setUploadProgress({ current: 0, total: files.length + 1, message: "Iniciando Base Maestra..." });
                const nuevoId = `master-knowledge-${Date.now()}`;
                storeName = await geminiService.createRagStore(nuevoId);
                setActiveRagStoreName(storeName);
            }

            const totalSteps = files.length + 1;

            // CAMBIO: Añadimos archivos al almacén existente
            for (let i = 0; i < files.length; i++) {
                setUploadProgress({ 
                    current: i + 1, 
                    total: totalSteps, 
                    message: "Alimentando base de conocimiento...", 
                    fileName: files[i].name 
                });
                await geminiService.uploadToRagStore(storeName, files[i]);
            }
            
            setUploadProgress({ current: totalSteps, total: totalSteps, message: "Actualizando sugerencias..." });
            const questions = await geminiService.generateExampleQuestions(storeName);
            setExampleQuestions(questions);

            setDocumentName("Base de Conocimiento Maestro");
            setStatus(AppStatus.Chatting);
            setFiles([]); 
        } catch (err) {
            handleError("Error al actualizar la base de conocimientos", err);
            throw err;
        } finally {
            setUploadProgress(null);
        }
    };

    // CAMBIO: "New Chat" ahora solo limpia la pantalla, NO borra la base de datos de Google
    const handleEndChat = () => {
        setChatHistory([]);
        // Si quieres que al dar a "New Chat" vuelva a la pantalla de subir archivos:
        // setStatus(AppStatus.Welcome); 
        // Pero si prefieres que siga en el chat pero vacío, solo limpia el historial.
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
                parts: [{ text: "Lo siento, hubo un error al procesar tu consulta." }]
            };
            setChatHistory(prev => [...prev, errorMessage]);
        } finally {
            setIsQueryLoading(false);
        }
    };
    
    const renderContent = () => {
        switch(status) {
            case AppStatus.Initializing:
                return (
                    <div className="flex items-center justify-center h-screen">
                        <Spinner /> <span className="ml-4 text-xl">Iniciando...</span>
                    </div>
                );
            case AppStatus.Welcome:
                 return <WelcomeScreen onUpload={handleUploadAndStartChat} apiKeyError={apiKeyError} files={files} setFiles={setFiles} isApiKeySelected={isApiKeySelected} onSelectKey={handleSelectKey} />;
            case AppStatus.Uploading:
                return <ProgressBar 
                    progress={uploadProgress?.current || 0} 
                    total={uploadProgress?.total || 1} 
                    message={uploadProgress?.message || "Preparando..."} 
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
                />;
            case AppStatus.Error:
                 return (
                    <div className="flex flex-col items-center justify-center h-screen text-red-600">
                        <h1 className="text-3xl font-bold mb-4">Error</h1>
                        <p className="mb-4">{error}</p>
                        <button onClick={clearError} className="px-4 py-2 bg-gem-blue text-white rounded-md">Reintentar</button>
                    </div>
                );
            default:
                 return <WelcomeScreen onUpload={handleUploadAndStartChat} apiKeyError={apiKeyError} files={files} setFiles={setFiles} isApiKeySelected={isApiKeySelected} onSelectKey={handleSelectKey} />;
        }
    }

    return (
        <main className="h-screen bg-gem-onyx text-gem-offwhite">
            {renderContent()}
        </main>
    );
};

export default App;
