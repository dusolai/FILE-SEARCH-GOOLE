import React, { useState, useCallback } from 'react';
import UploadCloudIcon from './icons/UploadCloudIcon';
import TrashIcon from './icons/TrashIcon';

interface WelcomeScreenProps {
    onUpload: () => Promise<void>;
    apiKeyError: string | null;
    files: File[];
    setFiles: React.Dispatch<React.SetStateAction<File[]>>;
    isApiKeySelected: boolean;
    onApiKeySet: (key: string) => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ 
    onUpload, 
    apiKeyError, 
    files, 
    setFiles, 
    isApiKeySelected, 
    onApiKeySet 
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [localApiKey, setLocalApiKey] = useState('');
    const [keyError, setKeyError] = useState('');

    const handleSaveKey = (e: React.FormEvent) => {
        e.preventDefault(); // ¡CRÍTICO! Evita recarga
        console.log("WelcomeScreen: Botón Guardar pulsado");
        if (!localApiKey.trim()) {
             setKeyError('La clave no puede estar vacía');
             return;
        }
        onApiKeySet(localApiKey);
        setKeyError('');
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            setFiles(prev => [...prev, ...Array.from(event.target.files!)]);
        }
    };
    
    // ... Drag & Drop logic (simplificada para ahorrar espacio, mantén la tuya si quieres) ...
    const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault(); setIsDragging(false);
        if (event.dataTransfer.files) setFiles(prev => [...prev, ...Array.from(event.dataTransfer.files)]);
    }, [setFiles]);
    const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
    const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-900 text-white">
            <div className="w-full max-w-3xl text-center space-y-8">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                    Cerebro Diego RAG
                </h1>

                {/* SECCIÓN API KEY */}
                {!isApiKeySelected ? (
                    <div className="max-w-md mx-auto bg-gray-800 p-6 rounded-xl border border-gray-700">
                        <h3 className="text-lg font-medium mb-4 text-blue-400">1. Conecta tu API Key</h3>
                        <form onSubmit={handleSaveKey} className="space-y-4">
                            <input
                                type="password"
                                value={localApiKey}
                                onChange={(e) => setLocalApiKey(e.target.value)}
                                placeholder="Pega tu clave AIza..."
                                className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white"
                            />
                            {keyError && <p className="text-red-400 text-sm">{keyError}</p>}
                            <button
                                type="submit"
                                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg"
                            >
                                Guardar Clave
                            </button>
                        </form>
                    </div>
                ) : (
                    <div className="max-w-md mx-auto bg-green-900/30 border border-green-500/30 p-3 rounded-lg text-green-400">
                        ✅ API Key Conectada
                    </div>
                )}

                {/* SECCIÓN ARCHIVOS */}
                <div 
                    className={`relative border-2 border-dashed rounded-xl p-10 transition-all ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 bg-gray-800/30'}`}
                    onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
                >
                    <UploadCloudIcon /> 
                    <p className="mt-4 text-gray-300">Arrastra tus PDF/MD aquí</p>
                    <input id="file-upload" type="file" multiple className="hidden" onChange={handleFileChange} />
                    <label htmlFor="file-upload" className="mt-4 cursor-pointer px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-full inline-block">
                        O buscar archivos
                    </label>
                </div>

                {/* LISTA DE ARCHIVOS */}
                {files.length > 0 && (
                    <div className="bg-gray-800 rounded-lg p-4 text-left border border-gray-700 max-w-xl mx-auto">
                        <h4 className="font-semibold mb-3 text-gray-300">Archivos ({files.length}):</h4>
                        <ul className="max-h-40 overflow-y-auto space-y-2">
                            {files.map((file, index) => (
                                <li key={index} className="flex justify-between items-center bg-gray-900 p-2 rounded">
                                    <span className="truncate text-sm text-gray-300">{file.name}</span>
                                    <button onClick={() => setFiles(f => f.filter((_, i) => i !== index))} className="text-red-400 p-1"><TrashIcon /></button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* BOTÓN FINAL */}
                {files.length > 0 && (
                    <button 
                        onClick={onUpload}
                        disabled={!isApiKeySelected}
                        className={`w-full max-w-md mx-auto py-4 rounded-xl font-bold text-lg shadow-lg ${isApiKeySelected ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                    >
                        🚀 SUBIR Y CREAR CEREBRO
                    </button>
                )}

                {apiKeyError && <div className="p-4 bg-red-900/50 text-red-200 rounded-lg">{apiKeyError}</div>}
            </div>
        </div>
    );
};

export default WelcomeScreen;