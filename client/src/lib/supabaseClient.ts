import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase environment variables are missing. Please provide NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
