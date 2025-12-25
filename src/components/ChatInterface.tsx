import React, { useRef, useEffect, useState } from 'react';
import SendIcon from './icons/SendIcon';
import RefreshIcon from './icons/RefreshIcon';
import Spinner from './Spinner';
import { ChatMessage } from '../types';

interface ChatInterfaceProps {
    documentName: string;
    history: ChatMessage[];
    isQueryLoading: boolean;
    onSendMessage: (message: string) => void;
    onNewChat: () => void;
    exampleQuestions: string[];
    ragStoreId: string; // <--- NUEVO CAMPO
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
    documentName, 
    history, 
    isQueryLoading, 
    onSendMessage, 
    onNewChat, 
    exampleQuestions,
    ragStoreId 
}) => {
    const [inputValue, setInputValue] = useState('');
    const [copied, setCopied] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [history, isQueryLoading]);

    const handleSend = () => {
        if (!inputValue.trim()) return;
        onSendMessage(inputValue);
        setInputValue('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(ragStoreId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-white">
            {/* Header con ID para n8n */}
            <header className="bg-gray-800 border-b border-gray-700 p-4 shadow-md z-10">
                <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-blue-400">{documentName}</h1>
                        <div className="flex items-center gap-2 mt-1 text-sm bg-black/30 px-3 py-1 rounded-full border border-gray-600">
                            <span className="text-gray-400">ID del Cerebro:</span>
                            <code className="text-green-400 font-mono select-all">{ragStoreId}</code>
                            <button 
                                onClick={copyToClipboard}
                                className="ml-2 text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-white transition-colors"
                            >
                                {copied ? "¡Copiado!" : "Copiar"}
                            </button>
                        </div>
                    </div>
                    <button onClick={onNewChat} className="text-gray-400 hover:text-white flex items-center gap-2 text-sm">
                        <RefreshIcon /> Limpiar Chat
                    </button>
                </div>
                <div className="max-w-4xl mx-auto mt-2 text-xs text-gray-500 text-center sm:text-left">
                    👉 <strong>Para n8n:</strong> Copia el ID verde y pégalo en tu nodo de Google Gemini o guárdalo en tu base de datos (Supabase) vinculado a tu usuario.
                </div>
            </header>

            {/* Lista de Mensajes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <div className="max-w-3xl mx-auto space-y-6">
                    {history.length === 0 && (
                        <div className="text-center mt-20 opacity-50 space-y-4">
                            <p className="text-2xl">🧠</p>
                            <p>Tu memoria está lista. Pregunta lo que quieras.</p>
                            <div className="grid grid-cols-1 gap-2 max-w-md mx-auto mt-8">
                                {exampleQuestions.map((q, i) => (
                                    <button 
                                        key={i} 
                                        onClick={() => onSendMessage(q)}
                                        className="text-sm bg-gray-800 p-3 rounded-lg hover:bg-gray-700 border border-gray-700 transition-colors text-left"
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {history.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl p-4 ${
                                msg.role === 'user' 
                                    ? 'bg-blue-600 text-white rounded-br-none' 
                                    : 'bg-gray-800 text-gray-100 rounded-bl-none border border-gray-700'
                            }`}>
                                <div className="whitespace-pre-wrap leading-relaxed">{msg.parts[0].text}</div>
                            </div>
                        </div>
                    ))}
                    
                    {isQueryLoading && (
                        <div className="flex justify-start">
                            <div className="bg-gray-800 rounded-2xl rounded-bl-none p-4 border border-gray-700 flex items-center gap-3">
                                <Spinner />
                                <span className="text-sm text-gray-400">Pensando...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input */}
            <div className="p-4 bg-gray-800 border-t border-gray-700">
                <div className="max-w-3xl mx-auto relative">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Pregunta a tu cerebro..."
                        className="w-full bg-gray-900 text-white pl-4 pr-12 py-4 rounded-xl border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all shadow-inner"
                    />
                    <button 
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isQueryLoading}
                        className="absolute right-2 top-2 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <SendIcon />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatInterface;