"use client";

import { useState, useEffect } from 'react';
import { useChat } from '@/components/chat-provider';

export default function ChatPage() {
    const { socket } = useChat();
    const [messages, setMessages] = useState<{ sender: string; message: string }[]>([]);
    const [input, setInput] = useState('');

    useEffect(() => {
        if (!socket) return;

        socket.on('message', (payload: { sender: string; message: string }) => {
            setMessages((prev) => [...prev, payload]);
        });

        socket.on('initial_messages', (history: { sender: string; message: string }[]) => {
            const formattedHistory = history.map(msg => ({
                sender: msg.sender,
                message: (msg as any).content || msg.message
            }));
            setMessages(formattedHistory);
        });

        return () => {
            socket.off('message');
            socket.off('initial_messages');
        };
    }, [socket]);

    const sendMessage = () => {
        if (socket && input.trim()) {
            socket.emit('message', { sender: 'User', message: input });
            setInput('');
        }
    };

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Chat Room</h1>
            <div className="border p-4 h-64 overflow-y-auto mb-4 bg-gray-100 rounded">
                {messages.map((msg, idx) => (
                    <div key={idx} className="mb-2">
                        <strong>{msg.sender}:</strong> {msg.message}
                    </div>
                ))}
            </div>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="border p-2 flex-1 rounded"
                    placeholder="Type a message..."
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                />
                <button onClick={sendMessage} className="bg-blue-500 text-white p-2 rounded">
                    Send
                </button>
            </div>
        </div>
    );
}
