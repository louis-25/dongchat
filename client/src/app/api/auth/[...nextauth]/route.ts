import { BASE_URL } from "@/config";
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import KakaoProvider from "next-auth/providers/kakao";

// NextAuth 설정
const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text", placeholder: "user" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.username || !credentials?.password) return null;

        try {
          console.log("[NextAuth] Attempting login for:", credentials.username);
          const res = await fetch(`${BASE_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: credentials.username,
              password: credentials.password,
            }),
          });

          const data = await res.json();
          console.log("[NextAuth] Backend response status:", res.status);
          console.log("[NextAuth] Backend response data:", data);

          if (res.ok && data && data.user) {
            console.log("[NextAuth] Login successful, user:", data.user);
            return data.user; // Return user object (id, username)
          }
          console.log("[NextAuth] Login failed");
          return null;
        } catch (e) {
          console.error("[NextAuth] Login error:", e);
          return null;
        }
      },
    }),
    KakaoProvider({
      clientId: process.env.KAKAO_CLIENT_ID || "",
      clientSecret: process.env.KAKAO_CLIENT_SECRET || "",
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (user) {
        token.id = (user as any).id;
        token.name = (user as any).username;
      }

      if (account?.provider === "kakao") {
        try {
          const providerId = account.providerAccountId;
          const nickname =
            (profile as any)?.properties?.nickname ||
            (profile as any)?.nickname;
          const usernameHint = (profile as any)?.id
            ? String((profile as any)?.id)
            : undefined;
          const res = await fetch(`${BASE_URL}/auth/kakao`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              providerId,
              nickname,
              username: usernameHint,
            }),
          });
          const data = await res.json();
          if (res.ok) {
            token.accessToken = data.access_token;
            token.refreshToken = data.refresh_token;
            token.name = data.user?.username;
            token.id = data.user?.id;
            token.role = data.user?.role;
            token.user = data.user;
          } else {
            console.error("[NextAuth] Kakao exchange failed", data);
          }
        } catch (e) {
          console.error("[NextAuth] Kakao exchange error", e);
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = token.name as string;
        (session.user as any).id = token.id;
        (session.user as any).role = (token as any).role;
      }
      (session as any).backendAccessToken = (token as any).accessToken;
      (session as any).backendRefreshToken = (token as any).refreshToken;
      (session as any).backendUser = (token as any).user;
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
  debug: true, // Enable debug mode to see detailed logs
});

export { handler as GET, handler as POST };
