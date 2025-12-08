'use client'
import useAuth from "@/hooks/useAuth";

const ProtectedLayout = ({ children }: { children: React.ReactNode }) => {
    useAuth();
    return <div>{children}</div>;
};

export default ProtectedLayout;
