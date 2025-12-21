import { createClient, Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Custom storage adapter for Chrome extension
// This allows the Supabase client to persist sessions in chrome.storage.local
const chromeStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const result = await chrome.storage.local.get([key]);
      return result[key] || null;
    } catch (error) {
      console.error('Error reading from chrome.storage:', error);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch (error) {
      console.error('Error writing to chrome.storage:', error);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await chrome.storage.local.remove([key]);
    } catch (error) {
      console.error('Error removing from chrome.storage:', error);
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: chromeStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Set the Supabase session after OAuth callback
 * This establishes the authenticated session for subsequent API calls
 */
export async function setSupabaseSession(session: {
  access_token: string;
  refresh_token: string;
}): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    if (error) {
      console.error('Failed to set Supabase session:', error);
      return { error };
    }

    return { error: null };
  } catch (err) {
    console.error('Unexpected error setting session:', err);
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Get the current Supabase session
 * Returns null if not authenticated
 */
export async function getSupabaseSession(): Promise<Session | null> {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      console.error('Failed to get session:', error);
      return null;
    }

    return session;
  } catch (err) {
    console.error('Unexpected error getting session:', err);
    return null;
  }
}

/**
 * Sign out and clear the Supabase session
 */
export async function signOutSupabase(): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
    }
  } catch (err) {
    console.error('Unexpected error during sign out:', err);
  }
}
