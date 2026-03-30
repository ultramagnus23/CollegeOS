import { createClient as _createClient, SupabaseClient } from '@supabase/supabase-js';

// Vite exposes env vars with the VITE_ prefix (not NEXT_PUBLIC_).
// Set these in your .env.local file:
//   VITE_SUPABASE_URL=https://vjxlpkqpwlgkdzheummp.supabase.co
//   VITE_SUPABASE_ANON_KEY=sb_publishable_...   ← "anon" / publishable key from Supabase dashboard
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[Supabase] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env.local.\n' +
    'Find these values in Supabase Dashboard → Project Settings → API:\n' +
    '  • Project URL         → VITE_SUPABASE_URL\n' +
    '  • Anon / public key   → VITE_SUPABASE_ANON_KEY'
  );
}

let _client: SupabaseClient | null = null;

/**
 * Browser-side Supabase client (singleton).
 *
 * Use this for client-side Supabase queries, auth helpers, or real-time
 * subscriptions directly from React components.
 *
 * For server-side data fetching the existing Express backend (/api/*)
 * is the primary interface; this client is an optional supplement.
 *
 * Usage:
 *   import { createClient } from '@/utils/supabase/client';
 *   const supabase = createClient();
 *   const { data, error } = await supabase.from('colleges').select('*');
 */
export const createClient = (): SupabaseClient => {
  if (!_client) {
    _client = _createClient(supabaseUrl, supabaseAnonKey);
  }
  return _client;
};
