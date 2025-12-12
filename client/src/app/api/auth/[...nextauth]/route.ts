import { BASE_URL } from "@/config";
import NextAuth, { type DefaultSession, type DefaultUser } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import KakaoProvider from "next-auth/providers/kakao";

// NextAuth 타입 확장
declare module "next-auth" {
  interface User extends DefaultUser {
    id: number;
    username: string;
    role?: string;
  }

  interface Session extends DefaultSession {
    user: {
      id: number;
      name: string;
      role?: string;
    } & DefaultSession["user"];
    backendAccessToken?: string;
    backendRefreshToken?: string;
    backendUser?: {
      id: number;
      username: string;
      role?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: number;
    role?: string;
    accessToken?: string;
    refreshToken?: string;
    user?: {
      id: number;
      username: string;
      role?: string;
    };
  }
}

// Kakao 프로필 타입 정의
interface KakaoProfile {
  id: string | number;
  nickname?: string;
  properties?: {
    nickname?: string;
  };
}

// NextAuth 설정
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text", placeholder: "user" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
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
        token.id = typeof user.id === "number" ? user.id : Number(user.id);
        token.name = user.username;
        token.role = user.role;
      }

      if (account?.provider === "kakao") {
        try {
          const providerId = account.providerAccountId;
          const kakaoProfile = profile as KakaoProfile | undefined;
          const nickname =
            kakaoProfile?.properties?.nickname || kakaoProfile?.nickname;
          const usernameHint = kakaoProfile?.id
            ? String(kakaoProfile.id)
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
      if (session.user && token.id !== undefined) {
        session.user.name = token.name as string;
        session.user.id = token.id;
        session.user.role = token.role;
      }
      session.backendAccessToken = token.accessToken;
      session.backendRefreshToken = token.refreshToken;
      session.backendUser = token.user;
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
  debug: true, // Enable debug mode to see detailed logs
});

// Route Handler export (Next.js App Router)
export const { GET, POST } = handlers;
