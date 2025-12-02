"use client";

import { useState, useEffect } from 'react';
import { useChat } from '@/components/chat-provider';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
        <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
            <Card className="w-full max-w-2xl h-[80vh] flex flex-col">
                <CardHeader>
                    <CardTitle>채팅방</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto mb-4 space-y-2 p-2 border rounded-md bg-white">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex flex-col ${msg.sender === session.user?.name ? 'items-end' : 'items-start'}`}>
                                <span className="text-xs text-gray-500">{msg.sender}</span>
                                <div className={`p-2 rounded-lg max-w-[80%] ${msg.sender === session.user?.name ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'}`}>
                                    {msg.message}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <Input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="메시지를 입력하세요..."
                            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                        />
                        <Button onClick={sendMessage}>
                            전송
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
