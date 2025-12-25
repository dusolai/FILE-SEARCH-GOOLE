import React, { useState, useCallback } from 'react';
import Spinner from './Spinner';
import UploadCloudIcon from './icons/UploadCloudIcon';
import CarIcon from './icons/CarIcon';
import WashingMachineIcon from './icons/WashingMachineIcon';
import TrashIcon from './icons/TrashIcon';

interface WelcomeScreenProps {
    onUpload: () => Promise<void>;
    apiKeyError: string | null;
    files: File[];
    setFiles: React.Dispatch<React.SetStateAction<File[]>>;
    isApiKeySelected: boolean;
    onApiKeySet: (key: string) => void; // Hemos simplificado esto
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

    // Función directa para guardar la clave
    const handleSaveKey = (e: React.FormEvent) => {
        e.preventDefault();
        if (!localApiKey.startsWith('AIza')) {
            setKeyError('La clave debe empezar por "AIza"');
            return;
        }
        onApiKeySet(localApiKey);
        setKeyError('');
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            setFiles(prev => [...prev, ...Array.from(event.target.files!)]);
        }
    };
    
    const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
        if (event.dataTransfer.files) {
            setFiles(prev => [...prev, ...Array.from(event.dataTransfer.files)]);
        }
    }, [setFiles]);

    const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isDragging) setIsDragging(true);
    }, [isDragging]);
    
    const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleRemoveFile = (indexToRemove: number) => {
        setFiles(prevFiles => prevFiles.filter((_, index) => index !== indexToRemove));
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-900 text-white">
            <div className="w-full max-w-3xl text-center space-y-8">
                
                {/* Título */}
                <div className="space-y-2">
                    <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                        Cerebro Diego RAG
                    </h1>
                    <p className="text-gray-400">
                        Sube tus documentos para crear tu memoria maestra.
                    </p>
                </div>

                {/* ZONA DE API KEY (Integrada aquí para que no falle) */}
                {!isApiKeySelected ? (
                    <div className="max-w-md mx-auto bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-xl">
                        <h3 className="text-lg font-medium mb-4 text-blue-400">Paso 1: Conecta tu Inteligencia</h3>
                        <form onSubmit={handleSaveKey} className="space-y-4">
                            <input
                                type="password"
                                value={localApiKey}
                                onChange={(e) => setLocalApiKey(e.target.value)}
                                placeholder="Pega tu Google Gemini API Key aquí..."
                                className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            />
                            {keyError && <p className="text-red-400 text-sm">{keyError}</p>}
                            <button
                                type="submit"
                                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors"
                            >
                                Guardar Clave
                            </button>
                        </form>
                        <p className="text-xs text-gray-500 mt-3">
                            La clave se guarda localmente en tu navegador.
                        </p>
                    </div>
                ) : (
                    <div className="max-w-md mx-auto bg-green-900/30 border border-green-500/30 p-3 rounded-lg text-green-400 font-medium">
                        ✅ API Key Conectada Correctamente
                    </div>
                )}

                {/* ZONA DE CARGA DE ARCHIVOS */}
                <div className="space-y-4">
                    <div 
                        className={`relative border-2 border-dashed rounded-xl p-10 transition-all ${
                            isDragging 
                                ? 'border-blue-500 bg-blue-500/10 scale-105' 
                                : 'border-gray-700 hover:border-gray-600 bg-gray-800/30'
                        }`}
                        onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
                    >
                        <div className="flex flex-col items-center">
                            <UploadCloudIcon /> 
                            <p className="mt-4 text-lg text-gray-300">Arrastra tus archivos .MD aquí</p>
                            <input id="file-upload" type="file" multiple className="hidden" onChange={handleFileChange} accept=".pdf,.txt,.md"/>
                            <label 
                                htmlFor="file-upload" 
                                className="mt-4 cursor-pointer px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-full font-medium transition-colors inline-block"
                            >
                                O seleccionar archivos
                            </label>
                        </div>
                    </div>

                    {/* Lista de archivos */}
                    {files.length > 0 && (
                        <div className="bg-gray-800 rounded-lg p-4 text-left border border-gray-700">
                            <h4 className="font-semibold mb-3 text-gray-300">Archivos listos para subir ({files.length}):</h4>
                            <ul className="max-h-40 overflow-y-auto space-y-2">
                                {files.map((file, index) => (
                                    <li key={index} className="flex justify-between items-center bg-gray-900 p-2 rounded border border-gray-800">
                                        <span className="truncate text-sm text-gray-300">{file.name}</span>
                                        <button onClick={() => handleRemoveFile(index)} className="text-red-400 hover:text-red-300 p-1">
                                            <TrashIcon />
                                        </button>
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
                            className={`w-full max-w-md mx-auto py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-105 ${
                                isApiKeySelected 
                                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white cursor-pointer' 
                                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                            }`}
                        >
                            {isApiKeySelected ? "🚀 SUBIR AL CEREBRO DE GEMINI" : "⚠️ Faltan pasos (Pon la API Key)"}
                        </button>
                    )}
                </div>

                {apiKeyError && (
                    <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
                        Error: {apiKeyError}
                    </div>
                )}
            </div>
        </div>
    );
};

export default WelcomeScreen;
