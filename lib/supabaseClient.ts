import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Supabase environment variables eksik. Lütfen SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY değerlerini .env.local dosyasına ekleyin."
  );
}

export const supabaseServerClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
