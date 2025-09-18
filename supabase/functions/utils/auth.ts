import { logger } from './logger.ts';
import { supabase } from './supabase.ts';

export interface AuthenticatedUser {
  id: string;
  email: string;
  user_metadata: any;
}

/**
 * Authenticate and authorize a request using Yahoo access token
 * Validates the Yahoo token by calling Yahoo's userinfo endpoint
 *
 * This is the single authentication function used by all edge functions.
 *
 * Flow:
 * 1. Client sends request with Yahoo token in request body
 * 2. Server validates Yahoo token with Yahoo's API
 * 3. If token is expired/invalid, returns 401
 * 4. Client handles 401 by refreshing tokens and retrying
 */
export async function authenticateRequest(
  req: Request,
  yahooToken: string
): Promise<{
  user: AuthenticatedUser | null;
  error: string | null;
}> {
  try {
    // Validate the Yahoo access token by calling Yahoo's userinfo endpoint
    const userInfoResponse = await fetch(
      'https://api.login.yahoo.com/openid/v1/userinfo',
      {
        headers: {
          Authorization: `Bearer ${yahooToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!userInfoResponse.ok) {
      logger.warn('Yahoo token validation failed', {
        status: userInfoResponse.status,
        statusText: userInfoResponse.statusText,
      });
      return { user: null, error: 'Invalid or expired Yahoo token' };
    }

    const userInfo = await userInfoResponse.json();
    const yahooUserId = userInfo.sub || userInfo.id;

    if (!yahooUserId) {
      logger.warn('No user ID in Yahoo userinfo response');
      return { user: null, error: 'Invalid user information from Yahoo' };
    }

    // Find user in Supabase by Yahoo ID
    const { data: userData, error: userError } = await supabase.rpc(
      'get_user_by_yahoo_id',
      { yahoo_user_id: yahooUserId }
    );

    if (userError || !userData || userData.length === 0) {
      logger.warn('User not found in Supabase', {
        yahooUserId,
        error: userError,
      });
      return { user: null, error: 'User not found' };
    }

    const user = userData[0];
    const userMetadata = user.user_metadata;

    // Verify the token matches what we have stored
    if (userMetadata?.yahoo_access_token !== yahooToken) {
      logger.warn('Yahoo token mismatch', { yahooUserId });
      return { user: null, error: 'Token mismatch - please re-authenticate' };
    }

    logger.info('User authenticated successfully with Yahoo token', {
      userId: user.id,
      yahooUserId,
      email: userInfo.email,
    });

    return {
      user: {
        id: user.id,
        email: userInfo.email || user.email || '',
        user_metadata: userMetadata,
      },
      error: null,
    };
  } catch (error) {
    logger.error('Authentication error', { error });
    return { user: null, error: 'Authentication failed' };
  }
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  message: string,
  status: number = 401,
  details?: string
): Response {
  return new Response(
    JSON.stringify({
      error: message,
      details,
      timestamp: new Date().toISOString(),
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers':
          'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
      },
    }
  );
}
