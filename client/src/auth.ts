import {
  BASE_URL,
  KAKAO_CLIENT_ID,
  KAKAO_CLIENT_SECRET,
  NEXTAUTH_SECRET,
  joinUrl,
} from "@/config";
import NextAuth, { type DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import KakaoProvider from "next-auth/providers/kakao";

// JWT 토큰 타입 정의
type JWTToken = {
  id?: number;
  name?: string | null;
  role?: string;
  accessToken?: string;
  refreshToken?: string;
  user?: {
    id: number;
    username: string;
    role?: string;
    profileImage?: string | null;
  };
  sub?: string;
  iat?: number;
  exp?: number;
  jti?: string;
};

// NextAuth 타입 확장
declare module "next-auth" {
  interface User {
    id: number;
    username: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string;
  }

  interface Session extends DefaultSession {
    user: {
      id: number;
      name: string;
      email?: string | null;
      image?: string | null;
      role?: string;
    };
    backendAccessToken?: string;
    backendRefreshToken?: string;
    backendUser?: {
      id: number;
      username: string;
      role?: string;
      profileImage?: string | null;
    };
  }
}

// Kakao 프로필 타입 정의
interface KakaoProfile {
  id: string | number;
  nickname?: string;
  properties?: {
    nickname?: string;
    profile_image?: string;
    thumbnail_image?: string;
  };
  kakao_account?: {
    profile?: {
      nickname?: string;
      profile_image_url?: string;
      thumbnail_image_url?: string;
    };
  };
}

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
          const res = await fetch(joinUrl(BASE_URL, "/auth/login"), {
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
      clientId: KAKAO_CLIENT_ID,
      clientSecret: KAKAO_CLIENT_SECRET,
    }),
  ],
  secret: NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, account, profile }): Promise<JWTToken> {
      if (user) {
        token.id = typeof user.id === "number" ? user.id : Number(user.id);
        token.name = user.username;
        token.role = user.role;
      }

      if (account?.provider === "kakao") {
        try {
          const providerId = account.providerAccountId;
          const kakaoProfile = profile as KakaoProfile | undefined;
          // nickname 추출 (우선순위: properties.nickname > kakao_account.profile.nickname > nickname)
          const nickname =
            kakaoProfile?.properties?.nickname ||
            kakaoProfile?.kakao_account?.profile?.nickname ||
            kakaoProfile?.nickname;
          // profile_image 추출 (우선순위: properties.profile_image > kakao_account.profile.profile_image_url)
          const profileImage =
            kakaoProfile?.properties?.profile_image ||
            kakaoProfile?.kakao_account?.profile?.profile_image_url ||
            kakaoProfile?.properties?.thumbnail_image ||
            kakaoProfile?.kakao_account?.profile?.thumbnail_image_url;
          // username은 nickname을 사용 (숫자 ID 대신)
          const res = await fetch(joinUrl(BASE_URL, "/auth/kakao"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              providerId,
              nickname,
              username: nickname || undefined, // nickname을 username으로 사용
              profileImage: profileImage || undefined,
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
      return {
        ...session,
        user: {
          ...session.user,
          id: typeof token.id === "number" ? token.id : 0,
          name:
            typeof token.name === "string"
              ? token.name
              : session.user.name || "",
          role: typeof token.role === "string" ? token.role : undefined,
        },
        backendAccessToken:
          typeof token.accessToken === "string" ? token.accessToken : undefined,
        backendRefreshToken:
          typeof token.refreshToken === "string"
            ? token.refreshToken
            : undefined,
        backendUser:
          token.user &&
          typeof token.user === "object" &&
          "id" in token.user &&
          "username" in token.user
            ? (() => {
                const user = token.user as {
                  id: number;
                  username: string;
                  role?: string;
                  profileImage?: string | null;
                };
                return {
                  id: typeof user.id === "number" ? user.id : 0,
                  username:
                    typeof user.username === "string" ? user.username : "",
                  role: typeof user.role === "string" ? user.role : undefined,
                  profileImage:
                    typeof user.profileImage === "string"
                      ? user.profileImage
                      : user.profileImage === null
                      ? null
                      : undefined,
                };
              })()
            : undefined,
      };
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
  debug: true,
});
