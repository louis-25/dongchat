import { defineConfig } from 'orval';

export default defineConfig({
    dongchat: {
        input: {
            target: 'http://localhost:4000/api-docs-json',
        },
        output: {
            mode: 'tags-split',
            target: './src/services',
            schemas: './src/lib/api/models',
            client: 'react-query',
            mock: false,
            clean: true,
            prettier: true,
            override: {
                mutator: {
                    path: './src/lib/api-client.ts',
                    name: 'customInstance',
                },
                query: {
                    useQuery: true,
                    useMutation: true,
                    options: {
                        staleTime: 60000, // 1분
                    },
                },
            },
        },
        hooks: {
            afterAllFilesWrite: 'prettier --write',
        },
    },
});
