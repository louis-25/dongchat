import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

// 브라우저에서는 @supabase/ssr이 싱글턴을 돌려준다. services/에서만 사용한다.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
