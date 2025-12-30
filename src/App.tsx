import React, { useState, useEffect } from 'react';
import { AppStatus, ChatMessage } from './types';
import * as geminiService from './services/geminiService';
import Spinner from './components/Spinner';
import WelcomeScreen from './components/WelcomeScreen';
import ProgressBar from './components/ProgressBar';
import ChatInterface from './components/ChatInterface';

const App: React.FC = () => {
    // ESTADOS
    const [status, setStatus] = useState<AppStatus>(AppStatus.Initializing);
    const [isApiKeySelected, setIsApiKeySelected] = useState(false);
    const [apiKeyError, setApiKeyError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<any>(null);
    const [fileList, setFileList] = useState<string[]>([]);
    const [showFilesModal, setShowFilesModal] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const [isQueryLoading, setIsQueryLoading] = useState(false);

    // PERSISTENCIA
    const [activeRagStoreName, setActiveRagStoreName] = useState<string | null>(
        localStorage.getItem('master_rag_store_id')
    );
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => {
        try {
            const saved = localStorage.getItem('chat_history');
            return saved ? JSON.parse(saved) : [];
        } catch (e) { 
            return []; 
        }
    });

    // --- FUNCIONES ---

    const fetchFiles = async (storeId: string) => {
        try {
            const list = await geminiService.listFiles(storeId);
            setFileList(list);
        } catch (e) {
            console.error("Error al listar archivos:", e);
        }
    };

    const resetApplication = () => {
        if(confirm("¿Estás seguro? Se borrará la memoria local del navegador (no la del servidor).")) {
            localStorage.clear();
            window.location.reload();
        }
    };

    const handleApiKeySet = (key: string) => {
        localStorage.setItem('gemini_api_key', key);
        geminiService.initialize(key);
        setIsApiKeySelected(true);
    };

    const handleUploadProcess = async (filesToUpload: File[], existingStoreId: string | null) => {
        setStatus(AppStatus.Uploading);
        setError(null);
        
        try {
            let storeId = existingStoreId;
            
            // Crear store si no existe
            if (!storeId) {
                setUploadProgress({ 
                    current: 0, 
                    total: filesToUpload.length, 
                    message: "🧠 Creando Cerebro..." 
                });
                
                storeId = await geminiService.createRagStore(`CEREBRO_${Date.now()}`);
                setActiveRagStoreName(storeId);
                console.log(`✅ Store creado: ${storeId}`);
            }

            // Procesar cada archivo
            for (let i = 0; i < filesToUpload.length; i++) {
                const file = filesToUpload[i];
                
                setUploadProgress({ 
                    current: i, 
                    total: filesToUpload.length, 
                    message: `📤 Subiendo ${file.name}...` 
                });
                
                await geminiService.uploadToRagStore(storeId!, file);
                
                // Actualizar progreso después de cada archivo
                setUploadProgress({ 
                    current: i + 1, 
                    total: filesToUpload.length, 
                    message: `✅ ${file.name} procesado` 
                });
            }
            
            // Recargar lista de archivos
            await fetchFiles(storeId!);
            
            // Limpiar y volver al chat
            setFiles([]);
            setShowFilesModal(false);
            setUploadProgress(null);
            setStatus(AppStatus.Chatting);
            
            console.log(`🎉 Todos los archivos procesados correctamente`);
            
        } catch (err: any) {
            console.error("Error en upload:", err);
            setError(err.message || "Error desconocido al subir archivos");
            setStatus(AppStatus.Error);
            setUploadProgress(null);
        }
    };

    const handleSendMessage = async (msg: string) => {
        if (!activeRagStoreName) return;
        
        // Añadir mensaje del usuario
        setChatHistory(prev => [...prev, { 
            role: 'user', 
            parts: [{ text: msg }] 
        }]);
        
        setIsQueryLoading(true);
        
        try {
            const res = await geminiService.fileSearch(activeRagStoreName, msg);
            
            setChatHistory(prev => [...prev, { 
                role: 'model', 
                parts: [{ text: res.text }],
                groundingChunks: res.groundingChunks
            }]);
        } catch (e: any) {
            console.error("Error en búsqueda:", e);
            setChatHistory(prev => [...prev, { 
                role: 'model', 
                parts: [{ text: "❌ Error de conexión: " + e.message }] 
            }]);
        } finally {
            setIsQueryLoading(false);
        }
    };

    // --- EFECTOS ---

    // Guardar chat
    useEffect(() => { 
        localStorage.setItem('chat_history', JSON.stringify(chatHistory)); 
    }, [chatHistory]);
    
    // Guardar Store ID
    useEffect(() => { 
        if (activeRagStoreName) {
            localStorage.setItem('master_rag_store_id', activeRagStoreName); 
        }
    }, [activeRagStoreName]);

    // INICIALIZACIÓN
    useEffect(() => {
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) {
            geminiService.initialize(savedKey);
            setIsApiKeySelected(true);
        }
        
        if (activeRagStoreName) {
            console.log("🔄 Restaurando sesión:", activeRagStoreName);
            setStatus(AppStatus.Chatting);
            fetchFiles(activeRagStoreName);
        } else {
            setStatus(AppStatus.Welcome);
        }
    }, []); 

    // --- RENDER ---
    
    // Modal de Archivos
    const FilesModal = () => (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-lg border border-gray-700 shadow-2xl">
                <h2 className="text-xl font-bold mb-4 text-blue-400">📚 Documentos en Memoria</h2>
                
                <div className="max-h-60 overflow-y-auto mb-6 space-y-2 bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                    {fileList.length === 0 && (
                        <p className="text-gray-500 italic text-center py-4">
                            No hay archivos aún
                        </p>
                    )}
                    {fileList.map((f, i) => (
                        <div key={i} className="text-sm text-gray-300 flex items-center gap-2 p-2 hover:bg-gray-800 rounded">
                            📄 <span className="truncate">{f}</span>
                        </div>
                    ))}
                </div>
                
                <div className="border-t border-gray-700 pt-4">
                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-gray-600 border-dashed rounded-lg cursor-pointer bg-gray-700/50 hover:bg-gray-700 hover:border-blue-500 transition-all group">
                        <div className="flex flex-col items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
                            </svg>
                            <p className="mt-2 text-sm text-gray-400 group-hover:text-white">
                                Click para añadir más
                            </p>
                        </div>
                        <input 
                            type="file" 
                            className="hidden" 
                            multiple 
                            onChange={(e) => {
                                if (e.target.files?.length) {
                                    const newFiles = Array.from(e.target.files);
                                    handleUploadProcess(newFiles, activeRagStoreName);
                                }
                            }} 
                        />
                    </label>
                </div>
                
                <button 
                    onClick={() => setShowFilesModal(false)} 
                    className="mt-4 w-full py-2 bg-gray-700 rounded-lg hover:bg-gray-600 font-medium"
                >
                    Cerrar
                </button>
            </div>
        </div>
    );

    // ESTADOS DE PANTALLA

    if (status === AppStatus.Initializing) {
        return (
            <div className="h-screen bg-gray-900 flex flex-col items-center justify-center text-white gap-4">
                <Spinner />
                <p>Cargando Cerebro...</p>
                <button 
                    onClick={resetApplication} 
                    className="text-xs text-gray-500 hover:text-red-400 underline mt-8"
                >
                    ¿Se ha quedado pillado? Resetear
                </button>
            </div>
        );
    }

    if (status === AppStatus.Error) {
        return (
            <div className="h-screen bg-gray-900 flex flex-col items-center justify-center text-red-500 p-4">
                <p className="text-xl mb-4">❌ Error</p>
                <p className="text-sm mb-8 text-center max-w-md">{error}</p>
                <button 
                    onClick={() => {
                        setStatus(AppStatus.Welcome);
                        setError(null);
                    }} 
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-500"
                >
                    Volver
                </button>
            </div>
        );
    }
    
    if (status === AppStatus.Uploading) {
        return (
            <ProgressBar 
                progress={uploadProgress?.current || 0} 
                total={uploadProgress?.total || 1} 
                message={uploadProgress?.message || "Procesando..."} 
            />
        );
    }
    
    if (status === AppStatus.Chatting) {
        return (
            <>
                <ChatInterface 
                    documentName="🧠 Cerebro Diego"
                    history={chatHistory} 
                    isQueryLoading={isQueryLoading} 
                    onSendMessage={handleSendMessage} 
                    onNewChat={resetApplication} 
                    exampleQuestions={[]} 
                    ragStoreId={activeRagStoreName || ''}
                    fileCount={fileList.length}
                    onManageFiles={() => setShowFilesModal(true)}
                />
                {showFilesModal && <FilesModal />}
            </>
        );
    }

    return (
        <WelcomeScreen 
            onUpload={() => handleUploadProcess(files, null)} 
            apiKeyError={apiKeyError} 
            files={files} 
            setFiles={setFiles} 
            isApiKeySelected={isApiKeySelected} 
            onApiKeySet={handleApiKeySet} 
        />
    );
};

export default App;
