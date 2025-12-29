import React, { useState, useEffect, useRef } from 'react';
import { AppStatus, ChatMessage } from './types';
import * as geminiService from './services/geminiService';
import Spinner from './components/Spinner';
import WelcomeScreen from './components/WelcomeScreen';
import ProgressBar from './components/ProgressBar';
import ChatInterface from './components/ChatInterface';
import UploadCloudIcon from './components/icons/UploadCloudIcon';

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
    const [activeRagStoreName, setActiveRagStoreName] = useState<string | null>(localStorage.getItem('master_rag_store_id'));
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => {
        try {
            const saved = localStorage.getItem('chat_history');
            return saved ? JSON.parse(saved) : [];
        } catch (e) { return []; } // Si falla al leer, empieza vacío
    });

    // --- FUNCIONES (Definidas ANTES de usarse para evitar errores) ---

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
        try {
            let storeId = existingStoreId;
            if (!storeId) {
                setUploadProgress({ current: 0, total: filesToUpload.length + 1, message: "Creando Cerebro..." });
                storeId = await geminiService.createRagStore(`CEREBRO_${Date.now()}`);
                setActiveRagStoreName(storeId);
            }

            for (let i = 0; i < filesToUpload.length; i++) {
                setUploadProgress({ current: i + 1, total: filesToUpload.length, message: `Subiendo ${filesToUpload[i].name}...` });
                await geminiService.uploadToRagStore(storeId!, filesToUpload[i]);
            }
            
            await fetchFiles(storeId!);
            setStatus(AppStatus.Chatting);
            setFiles([]);
            setShowFilesModal(false);
        } catch (err: any) {
            setError(err.message);
            setStatus(AppStatus.Error);
        } finally {
            setUploadProgress(null);
        }
    };

    const handleSendMessage = async (msg: string) => {
        if (!activeRagStoreName) return;
        setChatHistory(prev => [...prev, { role: 'user', parts: [{ text: msg }] }]);
        setIsQueryLoading(true);
        try {
            const res = await geminiService.fileSearch(activeRagStoreName, msg);
            setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: res.text }] }]);
        } catch (e) {
            setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: "Error de conexión." }] }]);
        } finally {
            setIsQueryLoading(false);
        }
    };

    // --- EFECTOS ---

    // 1. Guardar chat
    useEffect(() => { localStorage.setItem('chat_history', JSON.stringify(chatHistory)); }, [chatHistory]);
    
    // 2. Guardar Store ID
    useEffect(() => { 
        if (activeRagStoreName) localStorage.setItem('master_rag_store_id', activeRagStoreName); 
    }, [activeRagStoreName]);

    // 3. INICIALIZACIÓN (Ahora usa las funciones definidas arriba)
    useEffect(() => {
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) {
            geminiService.initialize(savedKey);
            setIsApiKeySelected(true);
        }
        
        if (activeRagStoreName) {
            console.log("Restaurando sesión...");
            setStatus(AppStatus.Chatting);
            fetchFiles(activeRagStoreName); // Carga la lista de archivos
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
                    {fileList.map((f, i) => (
                        <div key={i} className="text-sm text-gray-300 flex items-center gap-2 p-2 hover:bg-gray-800 rounded">
                            📄 <span className="truncate">{f}</span>
                        </div>
                    ))}
                    {fileList.length === 0 && <p className="text-gray-500 italic text-center py-4">Cargando lista...</p>}
                </div>
                
                <div className="border-t border-gray-700 pt-4">
                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-gray-600 border-dashed rounded-lg cursor-pointer bg-gray-700/50 hover:bg-gray-700 hover:border-blue-500 transition-all group">
                        <div className="flex flex-col items-center justify-center">
                            <UploadCloudIcon />
                            <p className="mt-2 text-sm text-gray-400 group-hover:text-white">Click para añadir más</p>
                        </div>
                        <input type="file" className="hidden" multiple onChange={(e) => {
                            if (e.target.files?.length) {
                                handleUploadProcess(Array.from(e.target.files), activeRagStoreName);
                            }
                        }} />
                    </label>
                </div>
                <button onClick={() => setShowFilesModal(false)} className="mt-4 w-full py-2 bg-gray-700 rounded-lg hover:bg-gray-600 font-medium">Cerrar</button>
            </div>
        </div>
    );

    if (status === AppStatus.Initializing) {
        return (
            <div className="h-screen bg-gray-900 flex flex-col items-center justify-center text-white gap-4">
                <Spinner />
                <p>Cargando Cerebro...</p>
                {/* Botón de escape por si se queda pillado */}
                <button onClick={resetApplication} className="text-xs text-gray-500 hover:text-red-400 underline mt-8">
                    ¿Se ha quedado pillado? Resetear
                </button>
            </div>
        );
    }

    if (status === AppStatus.Error) return <div className="h-screen bg-gray-900 flex flex-col items-center justify-center text-red-500"><p>{error}</p><button onClick={() => setStatus(AppStatus.Welcome)} className="mt-4 bg-blue-600 text-white p-2 rounded">Reiniciar</button></div>;
    
    if (status === AppStatus.Uploading) return <ProgressBar progress={uploadProgress?.current || 0} total={uploadProgress?.total || 100} message={uploadProgress?.message || "Cargando..."} />;
    
    if (status === AppStatus.Chatting) {
        return (
            <>
                <ChatInterface 
                    documentName="Cerebro Diego V1"
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

    return <WelcomeScreen onUpload={() => handleUploadProcess(files, null)} apiKeyError={apiKeyError} files={files} setFiles={setFiles} isApiKeySelected={isApiKeySelected} onApiKeySet={handleApiKeySet} />;
};

export default App;
