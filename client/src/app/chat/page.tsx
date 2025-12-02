"use client";

import { useState, useEffect } from 'react';
import { useChat } from '@/components/chat-provider';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

/**
 * 채팅 페이지 컴포넌트입니다.
 * 로그인된 사용자만 접근할 수 있으며, 실시간 채팅 기능을 제공합니다.
 */
export default function ChatPage() {
    const { socket } = useChat();
    const { data: session, status } = useSession();
    const router = useRouter();
    const [messages, setMessages] = useState<{ sender: string; message: string }[]>([]);
    const [input, setInput] = useState('');

    // 인증 상태 확인 및 리다이렉트 처리
    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/auth/signin');
        }
    }, [status, router]);

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
        if (socket && input.trim() && session?.user?.name) {
            // 실제 로그인된 사용자 이름으로 메시지 전송
            socket.emit('message', { sender: session.user.name, message: input });
            setInput('');
        }
    };

    if (status === 'loading') {
        return <div className="flex h-screen items-center justify-center">로딩 중...</div>;
    }

    if (!session) {
        return null;
    }

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">채팅방</h1>
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
                    placeholder="메시지를 입력하세요..."
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                />
                <button onClick={sendMessage} className="bg-blue-500 text-white p-2 rounded">
                    전송
                </button>
            </div>
        </div>
    );
}
