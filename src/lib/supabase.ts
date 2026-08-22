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

// 2. For Server-Side (API Routes, Actions, CRONs) - Hybrid Client
export const createServerClient = () => {
  // If we're on the client side, return the browser client
  if (typeof window !== 'undefined') return createClient();

  try {
    // Try to get cookies (this only works in Request contexts like API routes or Server Actions)
    const { cookies } = require('next/headers');
    const cookieStore = cookies();

    return createBrowserClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            try {
              cookieStore.set({ name, value, ...options })
            } catch (error) {
              // This can be ignored if you have middleware refreshing sessions
            }
          },
          remove(name: string, options: any) {
            try {
              cookieStore.set({ name, value: '', ...options })
            } catch (error) {
              // This can be ignored if you have middleware refreshing sessions
            }
          },
        },
      }
    )
  } catch (error) {
    // If cookies() fails, we are in a CRON job or background task.
    // Fallback to the Admin/Service Role client to allow the task to run.
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing for background task.");

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
}

// 3. Explicit Admin Client for when you DEFINITELY need service role
export const createAdminClient = () => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");

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

// 4. Service client for server-to-server routes (cron, sync, webhooks).
// These run with no user session, so the cookie client resolves to the anon
// role and every write is refused by RLS — that was the source of the 42501
// "new row violates row-level security policy" errors on webhook_logs.
// Authorization happens earlier, in requireInternal()/hasInternalSecret().
export const getServiceSupabase = (_req?: any) => createAdminClient();
