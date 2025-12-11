'use client'
import ProtectedHeader from "@/components/layout/ProtectedHeader";
import useAuth from "@/hooks/useAuth";

const ProtectedLayout = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuth();
    return (
        <div className="min-h-screen bg-gray-50">
            <ProtectedHeader user={user} />
            <main className="mx-auto max-w-5xl px-4 py-6">
                {children}
            </main>
        </div>
    );
};

export default ProtectedLayout;
