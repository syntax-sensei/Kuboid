import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log("Supabase configuration check:");
console.log("URL:", supabaseUrl ? "✓ Set" : "✗ Missing");
console.log("Anon Key:", supabaseAnonKey ? "✓ Set" : "✗ Missing");

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase environment variables are missing!");
  console.error("Please create a .env file with:");
  console.error("VITE_SUPABASE_URL=your_supabase_project_url");
  console.error("VITE_SUPABASE_ANON_KEY=your_supabase_anon_key");
  throw new Error(
    "Supabase environment variables are missing. Please provide NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
