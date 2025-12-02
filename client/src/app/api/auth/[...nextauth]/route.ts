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
                    console.log('[NextAuth] Attempting login for:', credentials.username);
                    const res = await fetch("http://localhost:4000/auth/login", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            username: credentials.username,
                            password: credentials.password,
                        }),
                    });

                    const data = await res.json();
                    console.log('[NextAuth] Backend response status:', res.status);
                    console.log('[NextAuth] Backend response data:', data);

                    if (res.ok && data && data.user) {
                        console.log('[NextAuth] Login successful, user:', data.user);
                        return data.user; // Return user object (id, username)
                    }
                    console.log('[NextAuth] Login failed');
                    return null;
                } catch (e) {
                    console.error("[NextAuth] Login error:", e);
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
                console.log('[NextAuth] JWT callback - user:', user);
                token.id = user.id;
                token.name = (user as any).username; // Map username to name
            }
            console.log('[NextAuth] JWT callback - token:', token);
            return token;
        },
        async session({ session, token }) {
            console.log('[NextAuth] Session callback - token:', token);
            if (session.user) {
                session.user.name = token.name as string; // Set username from token
                (session.user as any).id = token.id; // Set user ID
            }
            console.log('[NextAuth] Session callback - session:', session);
            return session;
        }
    },
    pages: {
        signIn: '/auth/signin',
    },
    debug: true, // Enable debug mode to see detailed logs
});

export { handler as GET, handler as POST };
