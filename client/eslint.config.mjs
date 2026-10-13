import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // 백엔드 교체 경계: Supabase는 services/·lib/supabase/·proxy·OAuth 콜백에서만 사용한다.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/services/**", "src/lib/supabase/**", "src/proxy.ts", "src/app/auth/callback/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@supabase/*"], message: "Supabase는 services/ 뒤에서만 사용합니다(백엔드 교체 경계)." },
            { group: ["@/lib/supabase/*", "**/lib/supabase/*"], message: "lib/supabase는 services/에서만 사용합니다." },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
