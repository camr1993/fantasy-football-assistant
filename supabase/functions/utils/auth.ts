import { createClient, User } from 'npm:@supabase/supabase-js@^2.76.1';
import { logger } from './logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

export interface AuthResult {
  user: User | null;
  error: string | null;
}

/**
 * Extract and verify the user from the JWT in the Authorization header.
 * Returns the authenticated user or an error message.
 *
 * Note: Supabase edge functions with verify_jwt=true already validate the JWT.
 * This function extracts the user information from the verified token.
 */
export async function getUserFromRequest(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('authorization');

  if (!authHeader) {
    logger.warn('No authorization header present');
    return { user: null, error: 'Missing authorization header' };
  }

  // Extract the JWT token (format: "Bearer <token>")
  const token = authHeader.replace('Bearer ', '');

  if (!token || token === authHeader) {
    logger.warn('Invalid authorization header format');
    return { user: null, error: 'Invalid authorization header format' };
  }

  // Create a Supabase client with the user's JWT to get user info
  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const {
      data: { user },
      error,
    } = await supabaseClient.auth.getUser();

    if (error) {
      logger.error('Failed to get user from JWT', { error: error.message });
      return { user: null, error: error.message };
    }

    if (!user) {
      logger.warn('No user found for provided token');
      return { user: null, error: 'No user found for token' };
    }

    logger.info('User authenticated via JWT', { userId: user.id });
    return { user, error: null };
  } catch (err) {
    logger.error('Unexpected error during authentication', {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      user: null,
      error: err instanceof Error ? err.message : 'Authentication failed',
    };
  }
}

/**
 * Create a standardized 401 error response for authentication failures
 */
export function createAuthErrorResponse(
  message: string,
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({
      code: 401,
      message,
    }),
    {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}
