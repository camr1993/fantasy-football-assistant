import { logger, performance } from '../../utils/logger.ts';
import { parseJwt } from '../utils/jwt.ts';
import { supabase } from '../../utils/supabase.ts';
import {
  YAHOO_CLIENT_ID,
  YAHOO_CLIENT_SECRET,
  REDIRECT_URI,
} from '../utils/constants.ts';
import { corsHeaders } from '../../utils/constants.ts';
// Nonce validation now done by comparing Chrome storage nonce with ID token nonce

// Handle OAuth callback from Yahoo
export async function handleOAuthCallback(req: Request) {
  const timer = performance.start('oauth_callback');

  try {
    let code, error, state, nonce;

    // Handle both GET (from Yahoo redirect) and POST (from manual code entry)
    if (req.method === 'GET') {
      const url = new URL(req.url);
      code = url.searchParams.get('code');
      error = url.searchParams.get('error');
      state = url.searchParams.get('state');
    } else if (req.method === 'POST') {
      const body = await req.json();
      code = body.code;
      error = body.error;
      state = body.state;
      nonce = body.nonce; // Extract nonce from request body
    } else {
      logger.warn('Invalid method for OAuth callback', { method: req.method });
      return new Response('Method not allowed', {
        status: 405,
        headers: { ...corsHeaders },
      });
    }

    logger.info('OAuth callback parameters received', {
      code: code ? 'present' : 'missing',
      error,
      state,
      method: req.method,
    });

    if (error) {
      logger.warn('OAuth error from Yahoo', { error });
      return new Response(`OAuth Error: ${error}`, {
        status: 400,
        headers: { ...corsHeaders },
      });
    }

    if (!code) {
      logger.warn('No authorization code received');
      return new Response('Authorization code not found', {
        status: 400,
        headers: { ...corsHeaders },
      });
    }

    // Log state parameter for debugging
    if (state) {
      logger.info('State parameter received', { state });
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch(
      'https://api.login.yahoo.com/oauth2/get_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${btoa(`${YAHOO_CLIENT_ID}:${YAHOO_CLIENT_SECRET}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: REDIRECT_URI,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error('Token exchange failed', { errorText });
      return new Response(`Token exchange failed: ${errorText}`, {
        status: 400,
        headers: { ...corsHeaders },
      });
    }

    const tokenData = await tokenResponse.json();
    logger.info('Token response received', {
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      hasIdToken: !!tokenData.id_token,
    });

    // Nonce validation will be done after parsing ID token
    // We'll compare the nonce from Chrome storage with the nonce in the ID token

    // Parse user information from ID token
    const idToken = tokenData.id_token;
    let userInfo;

    // Try to get user info from ID token first (since we only have openid scope)
    if (idToken) {
      logger.info('Parsing ID token for user info');
      userInfo = parseJwt(idToken);
      if (userInfo) {
        logger.info('User info from ID token', {
          hasEmail: !!userInfo.email,
          hasName: !!userInfo.name,
          hasSub: !!userInfo.sub,
          hasNonce: !!userInfo.nonce,
        });

        // Validate nonce from Chrome storage against nonce in ID token
        if (userInfo.nonce) {
          logger.info('Nonce found in ID token', { nonce: userInfo.nonce });

          // For POST requests (from popup), validate against stored nonce
          if (nonce) {
            if (userInfo.nonce !== nonce) {
              logger.error('Nonce mismatch - potential security issue', {
                idTokenNonce: userInfo.nonce,
                storedNonce: nonce,
              });
              return new Response('Nonce mismatch - potential security issue', {
                status: 400,
                headers: { ...corsHeaders },
              });
            }
            logger.info('Nonce validation successful - nonces match', {
              nonce: userInfo.nonce,
            });
          } else {
            logger.warn(
              'No nonce provided in request - cannot validate ID token nonce'
            );
          }
        } else {
          logger.warn(
            'No nonce found in ID token - this may indicate a security issue'
          );
        }
      }
    }

    // Try UserInfo API as fallback (might work even with just openid scope)
    if (!userInfo) {
      logger.info('No ID token or failed to parse, trying UserInfo API');
      try {
        const userInfoResponse = await fetch(
          'https://api.login.yahoo.com/openid/v1/userinfo',
          {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
              'Content-Type': 'application/json',
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            },
          }
        );

        if (userInfoResponse.ok) {
          userInfo = await userInfoResponse.json();
          logger.info('User info from Yahoo UserInfo API', {
            keys: Object.keys(userInfo),
            hasEmail: !!userInfo.email,
          });
        } else {
          const errorText = await userInfoResponse.text();
          logger.info('UserInfo API failed (expected with openid scope only)', {
            status: userInfoResponse.status,
            error: errorText,
          });
        }
      } catch (error) {
        logger.info('UserInfo API error (expected with openid scope only)', {
          error,
        });
      }
    }

    if (!userInfo) {
      logger.error('Failed to get user information from both ID token and API');
      return new Response('Failed to get user information', {
        status: 400,
        headers: { ...corsHeaders },
      });
    }

    // Ensure we have an email address
    let userEmail = userInfo.email;
    if (!userEmail) {
      // Generate a temporary email using Yahoo ID
      const yahooId = userInfo.sub || userInfo.id || 'unknown';
      userEmail = `yahoo_${yahooId}@temp.fantasy-assistant.app`;
      logger.info('No email found, using temporary email', { userEmail });
    }

    logger.info('Creating/updating user', {
      email: userEmail,
      yahooId: userInfo.sub || userInfo.id,
      hasName: !!userInfo.name,
    });

    // Check if user already exists by email (scalable approach)
    const { data: existingUserData, error: searchError } = await supabase.rpc(
      'get_user_by_email',
      { user_email: userEmail }
    );

    if (searchError) {
      logger.error('Error searching for existing user by email', {
        error: searchError,
      });
      return new Response(`User search failed: ${searchError.message}`, {
        status: 400,
        headers: { ...corsHeaders },
      });
    }

    // Check if user exists by email
    let existingUser = existingUserData?.[0] || null;

    // If no user found by email, try to find by yahoo_id
    if (!existingUser) {
      logger.info('No user found by email, checking by yahoo_id');
      const yahooId = userInfo.sub || userInfo.id;
      if (yahooId) {
        const { data: yahooUserData, error: yahooSearchError } =
          await supabase.rpc('get_user_by_yahoo_id', {
            yahoo_user_id: yahooId,
          });

        if (yahooSearchError) {
          logger.error('Error searching for existing user by yahoo_id', {
            error: yahooSearchError,
          });
          // Continue with user creation if yahoo_id search fails
        } else {
          existingUser = yahooUserData?.[0] || null;
          if (existingUser) {
            logger.info('Found existing user by yahoo_id', {
              userId: existingUser.id,
            });
          }
        }
      }
    }

    let user;
    let userError;

    if (existingUser) {
      logger.info('User already exists, updating metadata', {
        userId: existingUser.id,
      });

      // Update existing user's metadata with new tokens
      const { data: updatedUser, error: updateError } =
        await supabase.auth.admin.updateUserById(existingUser.id, {
          user_metadata: {
            ...existingUser.user_metadata,
            name:
              userInfo.name ||
              userInfo.given_name ||
              existingUser.user_metadata?.name ||
              'Yahoo User',
            picture: userInfo.picture || existingUser.user_metadata?.picture,
            yahoo_id: userInfo.sub || userInfo.id,
            yahoo_access_token: tokenData.access_token,
            yahoo_refresh_token: tokenData.refresh_token,
            yahoo_token_expires_at: new Date(
              Date.now() + tokenData.expires_in * 1000
            ).toISOString(),
          },
        });

      user = updatedUser;
      userError = updateError;
    } else {
      logger.info('User does not exist, creating new user');

      // Create new user
      const { data: newUser, error: createError } =
        await supabase.auth.admin.createUser({
          id: userInfo.sub || userInfo.id,
          email: userEmail,
          email_confirm: true,
          user_metadata: {
            name: userInfo.name || userInfo.given_name || 'Yahoo User',
            picture: userInfo.picture,
            yahoo_id: userInfo.sub || userInfo.id,
            yahoo_access_token: tokenData.access_token,
            yahoo_refresh_token: tokenData.refresh_token,
            yahoo_token_expires_at: new Date(
              Date.now() + tokenData.expires_in * 1000
            ).toISOString(),
          },
        });

      user = newUser;
      userError = createError;
    }

    if (userError) {
      logger.error('User operation failed', { error: userError });
      return new Response(`User operation failed: ${userError.message}`, {
        status: 400,
        headers: { ...corsHeaders },
      });
    }

    // Return success response with user info and tokens
    timer.end();
    return new Response(
      JSON.stringify({
        success: true,
        message: 'User authenticated and created successfully',
        user: {
          id: user.user?.id,
          email: user.user?.email,
          name: user.user?.user_metadata?.name,
          yahoo_access_token: user.user?.user_metadata?.yahoo_access_token,
          yahoo_refresh_token: user.user?.user_metadata?.yahoo_refresh_token,
          yahoo_token_expires_at:
            user.user?.user_metadata?.yahoo_token_expires_at,
        },
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    logger.error('OAuth callback error', error);
    timer.end();
    return new Response(`Internal server error: ${error.message}`, {
      status: 500,
      headers: { ...corsHeaders },
    });
  }
}
