import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

const handler = NextAuth({
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                username: { label: "Username", type: "text", placeholder: "user" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials, req) {
                // Mock user for now
                if (credentials?.username === "user" && credentials?.password === "password") {
                    return { id: "1", name: "Test User", email: "test@example.com" };
                }
                return null;
            }
        })
    ],
    secret: process.env.NEXTAUTH_SECRET,
    session: {
        strategy: "jwt",
    },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                // session.user.id = token.id as string; // Typescript might complain here
            }
            return session;
        }
    },
    pages: {
        signIn: '/auth/signin',
    },
});

export { handler as GET, handler as POST };
