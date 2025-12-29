import React, { useState, useEffect, useRef } from 'react';
import { AppStatus, ChatMessage } from './types';
import * as geminiService from './services/geminiService';
import Spinner from './components/Spinner';
import WelcomeScreen from './components/WelcomeScreen';
import ProgressBar from './components/ProgressBar';
import ChatInterface from './components/ChatInterface';
import UploadCloudIcon from './components/icons/UploadCloudIcon';

const App: React.FC = () => {
    const [status, setStatus] = useState<AppStatus>(AppStatus.Initializing);
    const [isApiKeySelected, setIsApiKeySelected] = useState(false);
    const [apiKeyError, setApiKeyError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<any>(null);
    
    // ESTADO DE ARCHIVOS (NUEVO)
    const [fileList, setFileList] = useState<string[]>([]);
    const [showFilesModal, setShowFilesModal] = useState(false);
    
    const [activeRagStoreName, setActiveRagStoreName] = useState<string | null>(localStorage.getItem('master_rag_store_id'));
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => {
        const saved = localStorage.getItem('chat_history');
        return saved ? JSON.parse(saved) : [];
    });

    const [isQueryLoading, setIsQueryLoading] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    
    // --- EFECTOS ---
    useEffect(() => { localStorage.setItem('chat_history', JSON.stringify(chatHistory)); }, [chatHistory]);
    
    useEffect(() => {
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) {
            geminiService.initialize(savedKey);
            setIsApiKeySelected(true);
        }
        if (activeRagStoreName) {
            setStatus(AppStatus.Chatting);
            fetchFiles(activeRagStoreName); // Cargar lista al inicio
        } else {
            setStatus(AppStatus.Welcome);
        }
    }, []); 

    useEffect(() => {
        if (activeRagStoreName) localStorage.setItem('master_rag_store_id', activeRagStoreName);
    }, [activeRagStoreName]);

    // --- FUNCIONES ---
    const fetchFiles = async (storeId: string) => {
        const list = await geminiService.listFiles(storeId);
        setFileList(list);
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
            
            await fetchFiles(storeId!); // Actualizar lista
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

    const handleApiKeySet = (key: string) => {
        localStorage.setItem('gemini_api_key', key);
        geminiService.initialize(key);
        setIsApiKeySelected(true);
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

    // --- MODAL DE ARCHIVOS ---
    const FilesModal = () => (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-lg border border-gray-700 shadow-2xl">
                <h2 className="text-xl font-bold mb-4 text-blue-400">📚 Documentos Cargados</h2>
                <div className="max-h-60 overflow-y-auto mb-6 space-y-2 bg-gray-900/50 p-3 rounded-lg">
                    {fileList.map((f, i) => (
                        <div key={i} className="text-sm text-gray-300 flex items-center gap-2">
                            📄 <span>{f}</span>
                        </div>
                    ))}
                    {fileList.length === 0 && <p className="text-gray-500 italic">No hay archivos.</p>}
                </div>
                
                <div className="border-t border-gray-700 pt-4">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-600 border-dashed rounded-lg cursor-pointer bg-gray-700 hover:bg-gray-600 transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <UploadCloudIcon />
                            <p className="mb-2 text-sm text-gray-400 font-semibold">Click para añadir más archivos</p>
                        </div>
                        <input type="file" className="hidden" multiple onChange={(e) => {
                            if (e.target.files?.length) {
                                handleUploadProcess(Array.from(e.target.files), activeRagStoreName);
                            }
                        }} />
                    </label>
                </div>
                <button onClick={() => setShowFilesModal(false)} className="mt-4 w-full py-2 bg-gray-700 rounded-lg hover:bg-gray-600">Cerrar</button>
            </div>
        </div>
    );

    if (status === AppStatus.Initializing) return <div className="h-screen bg-gray-900 flex items-center justify-center text-white"><Spinner /></div>;
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
                    onNewChat={() => {
                        if(confirm("¿Borrar chat visual?")) { setChatHistory([]); localStorage.removeItem('chat_history'); }
                    }} 
                    exampleQuestions={exampleQuestions} 
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
