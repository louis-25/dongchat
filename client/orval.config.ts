import { defineConfig } from "orval";

export default defineConfig({
  dongchat: {
    input: {
      target: "http://localhost:4000/api-docs-json",
    },
    output: {
      mode: "tags-split",
      target: "./src/services",
      schemas: "./src/lib/api/models",
      client: "react-query",
      mock: false,
      clean: true,
      prettier: true,
      override: {
        mutator: {
          path: "./src/lib/api-client.ts",
          name: "customInstance",
        },
        query: {
          useQuery: true,
          useMutation: true,
          version: 5, // React Query v5 사용
          shouldExportQueryKey: false, // queryKey를 반환 타입에서 제거하여 할당 에러 방지
          options: {
            staleTime: 60000, // 1분
          },
        },
      },
    },
    hooks: {
      afterAllFilesWrite: "node scripts/fix-query-key.mjs && prettier --write",
    },
  },
});
