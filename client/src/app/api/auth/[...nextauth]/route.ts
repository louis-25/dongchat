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
                if (!credentials?.username || !credentials?.password) return null;

                try {
                    const res = await fetch("http://localhost:4000/auth/login", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            username: credentials.username,
                            password: credentials.password,
                        }),
                    });

                    const user = await res.json();

                    if (res.ok && user) {
                        return user.user; // Return user object (id, username)
                    }
                    return null;
                } catch (e) {
                    console.error("Login error:", e);
                    return null;
                }
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
                token.name = (user as any).username; // Map username to name
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
