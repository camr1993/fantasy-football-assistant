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
    const { refresh_token, user_id } = await req.json();

    if (!refresh_token) {
      logger.warn('No refresh token provided');
      return new Response(
        JSON.stringify({ error: 'Refresh token is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!user_id) {
      logger.warn('No user ID provided');
      return new Response(JSON.stringify({ error: 'User ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the user exists and has the provided refresh token
    const { data: user, error: userError } =
      await supabase.auth.admin.getUserById(user_id);

    if (userError || !user) {
      logger.warn('User not found for token refresh', {
        user_id,
        error: userError,
      });
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the refresh token matches what we have stored
    const userMetadata = user.user.user_metadata;
    if (userMetadata?.yahoo_refresh_token !== refresh_token) {
      logger.warn('Refresh token mismatch', { user_id });
      return new Response(JSON.stringify({ error: 'Invalid refresh token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logger.info('Refreshing token', {
      hasRefreshToken: !!refresh_token,
      userId: user_id,
    });

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
      return new Response(
        JSON.stringify({ error: `Token refresh failed: ${errorText}` }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const tokenData = await tokenResponse.json();
    logger.info('Token refresh successful', {
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
    });

    // Update user's tokens in Supabase
    const { data: updatedUser, error: updateError } =
      await supabase.auth.admin.updateUserById(user_id, {
        user_metadata: {
          ...userMetadata,
          yahoo_access_token: tokenData.access_token,
          yahoo_refresh_token: tokenData.refresh_token,
          yahoo_token_expires_at: new Date(
            Date.now() + tokenData.expires_in * 1000
          ).toISOString(),
        },
      });

    if (updateError) {
      logger.error('Failed to update user tokens', { error: updateError });
      return new Response(
        JSON.stringify({
          error: `Failed to update user tokens: ${updateError.message}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
