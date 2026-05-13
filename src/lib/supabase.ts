import { createBrowserClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

let client: ReturnType<typeof createBrowserClient> | undefined;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("CRITICAL: Supabase environment variables are missing!", {
    url: !!supabaseUrl,
    key: !!supabaseAnonKey
  });
}

// 1. For Client-Side (React Components) - Uses ANON KEY + RLS
export const createClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase environment variables are missing. Please check your .env files and restart the server.");
  }
  if (typeof window === 'undefined') {
    return createBrowserClient(supabaseUrl, supabaseAnonKey, {
      cookieOptions: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      }
    });
  }

  if (!client) {
    client = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
      cookieOptions: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      }
    });
  }
  return client;
}

// 2. For Server-Side (API Routes, Actions, Server Libs) - Uses SERVICE ROLE KEY, Bypasses RLS
export const createServerClient = () => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    if (typeof window !== 'undefined') {
      // In the browser, we shouldn't have the service key. 
      // If this is called, we log a warning and return the standard client.
      console.warn("createServerClient called on client side. Using anon client instead.");
      return createClient();
    }
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing. Check your server environment variables.");
  }

  return createSupabaseClient(
    supabaseUrl,
    serviceKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );
}
