import { logger, performance } from '../utils/logger.ts';
import { supabase } from '../utils/supabase.ts';
import {
  corsHeaders,
  YAHOO_CLIENT_ID,
  YAHOO_CLIENT_SECRET,
} from '../utils/constants.ts';

// Handle token refresh
export async function handleTokenRefresh(req: Request) {
  const timer = performance.start('token_refresh');

  try {
    const { refresh_token } = await req.json();

    if (!refresh_token) {
      logger.warn('No refresh token provided');
      return new Response('Refresh token is required', {
        status: 400,
        headers: { ...corsHeaders },
      });
    }

    logger.info('Refreshing token', { hasRefreshToken: !!refresh_token });

    // Exchange refresh token for new access token
    const tokenResponse = await fetch(
      'https://api.login.yahoo.com/oauth2/get_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${btoa(`${YAHOO_CLIENT_ID}:${YAHOO_CLIENT_SECRET}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refresh_token,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error('Token refresh failed', { errorText });
      return new Response(`Token refresh failed: ${errorText}`, {
        status: 400,
        headers: { ...corsHeaders },
      });
    }

    const tokenData = await tokenResponse.json();
    logger.info('Token refresh successful', {
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
    });

    // Update user's tokens in Supabase
    const { data: user, error: userError } =
      await supabase.auth.admin.updateUserById(
        req.headers.get('x-user-id') || '',
        {
          user_metadata: {
            yahoo_access_token: tokenData.access_token,
            yahoo_refresh_token: tokenData.refresh_token,
            yahoo_token_expires_at: new Date(
              Date.now() + tokenData.expires_in * 1000
            ).toISOString(),
          },
        }
      );

    if (userError) {
      logger.error('Failed to update user tokens', { error: userError });
      return new Response(
        `Failed to update user tokens: ${userError.message}`,
        {
          status: 400,
          headers: { ...corsHeaders },
        }
      );
    }

    timer.end();
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Token refreshed successfully',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    logger.error('Token refresh error', error);
    timer.end();
    return new Response(`Internal server error: ${error.message}`, {
      status: 500,
      headers: { ...corsHeaders },
    });
  }
}
