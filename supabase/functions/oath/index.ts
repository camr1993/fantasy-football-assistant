// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// Yahoo OAuth configuration
const YAHOO_CLIENT_ID =
  Deno.env.get('YAHOO_CLIENT_ID') || 'YOUR_YAHOO_CLIENT_ID';
const YAHOO_CLIENT_SECRET =
  Deno.env.get('YAHOO_CLIENT_SECRET') || 'YOUR_YAHOO_CLIENT_SECRET';
const YAHOO_APP_ID = Deno.env.get('YAHOO_APP_ID') || 'YOUR_YAHOO_APP_ID';
const REDIRECT_URI = 'oob';

// Supabase configuration
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// JWT parser for ID token
function parseJwt(token: string) {
  try {
    if (!token || typeof token !== 'string') {
      console.error('Invalid token provided to parseJwt:', token);
      return null;
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error(
        'Invalid JWT format - expected 3 parts, got:',
        parts.length
      );
      return null;
    }

    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Error parsing JWT:', error);
    console.error('Token that failed to parse:', token);
    return null;
  }
}

Deno.serve(async (req) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Request headers:', Object.fromEntries(req.headers.entries()));

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  const url = new URL(req.url);
  const path = url.pathname;
  console.log('Request path:', path);

  // Handle OAuth initiation (requires auth header)
  if (path.endsWith('/auth')) {
    console.log('Handling OAuth initiation');
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.log('Missing authorization header for /auth route');
      return new Response(
        JSON.stringify({ code: 401, message: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    return handleOAuthInitiation();
  }

  // Handle OAuth callback (includes auth header)
  if (path.endsWith('/callback')) {
    console.log('Handling OAuth callback');
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.log('Missing authorization header for /callback route');
      return new Response(
        JSON.stringify({ code: 401, message: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    return handleOAuthCallback(req);
  }

  // Handle token refresh (requires auth header)
  if (path.endsWith('/refresh')) {
    console.log('Handling token refresh');
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.log('Missing authorization header for /refresh route');
      return new Response(
        JSON.stringify({ code: 401, message: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    return handleTokenRefresh(req);
  }

  console.log('No matching route found, returning 404');
  return new Response('Not Found', { status: 404 });
});

// Handle OAuth callback from Yahoo
async function handleOAuthCallback(req: Request) {
  try {
    let code, error, state;

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
    } else {
      return new Response('Method not allowed', {
        status: 405,
        headers: { ...corsHeaders },
      });
    }

    console.log('OAuth callback parameters:', {
      code: code ? 'present' : 'missing',
      error,
      state,
    });

    if (error) {
      console.log('OAuth error from Yahoo:', error);
      return new Response(`OAuth Error: ${error}`, {
        status: 400,
        headers: { ...corsHeaders },
      });
    }

    if (!code) {
      console.log('No authorization code received');
      return new Response('Authorization code not found', {
        status: 400,
        headers: { ...corsHeaders },
      });
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
      console.error('Token exchange failed:', errorText);
      return new Response(`Token exchange failed: ${errorText}`, {
        status: 400,
        headers: { ...corsHeaders },
      });
    }

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return new Response(
        `OAuth Error: ${tokenData.error_description || tokenData.error}`,
        { status: 400, headers: { ...corsHeaders } }
      );
    }

    // Parse user information from ID token
    const idToken = tokenData.id_token;
    console.log('Token response data:', tokenData);
    console.log('ID Token:', idToken);

    let userInfo;

    // Primary method: Get user info from Yahoo UserInfo API (recommended by Yahoo docs)
    console.log('Fetching user info from Yahoo UserInfo API');
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

      if (!userInfoResponse.ok) {
        const errorText = await userInfoResponse.text();
        console.error(
          'Failed to fetch user info from Yahoo API:',
          userInfoResponse.status,
          errorText
        );
        return new Response(
          `Failed to get user information from Yahoo: ${userInfoResponse.status} - ${errorText}`,
          {
            status: 400,
            headers: { ...corsHeaders },
          }
        );
      }

      userInfo = await userInfoResponse.json();
      console.log('User info from Yahoo UserInfo API:', userInfo);
      console.log('User info keys:', Object.keys(userInfo));
      console.log('Email from API:', userInfo.email);
    } catch (error) {
      console.error('Error fetching user info from API:', error);
      return new Response('Failed to get user information from Yahoo', {
        status: 400,
        headers: { ...corsHeaders },
      });
    }

    // Fallback: Try to parse ID token if UserInfo API fails
    if (!userInfo && idToken) {
      console.log('UserInfo API failed, trying ID token as fallback');
      userInfo = parseJwt(idToken);
      if (userInfo) {
        console.log('User info from ID token fallback:', userInfo);
      }
    }

    if (!userInfo) {
      console.error(
        'Failed to get user information from both ID token and API'
      );
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
      console.log('No email found, using temporary email:', userEmail);
    }

    console.log('Creating user with email:', userEmail);
    console.log('User metadata:', {
      name: userInfo.name,
      picture: userInfo.picture,
      yahoo_id: userInfo.sub || userInfo.id,
    });

    // Check if user already exists by email (scalable approach)
    const { data: existingUserData, error: searchError } = await supabase.rpc(
      'get_user_by_email',
      { user_email: userEmail }
    );

    if (searchError) {
      console.error('Error searching for existing user by email:', searchError);
      return new Response(`User search failed: ${searchError.message}`, {
        status: 400,
        headers: { ...corsHeaders },
      });
    }

    // Check if user exists by email
    let existingUser = existingUserData?.[0] || null;

    // If no user found by email, try to find by yahoo_id
    if (!existingUser) {
      console.log('No user found by email, checking by yahoo_id');
      const yahooId = userInfo.sub || userInfo.id;
      if (yahooId) {
        const { data: yahooUserData, error: yahooSearchError } =
          await supabase.rpc('get_user_by_yahoo_id', {
            yahoo_user_id: yahooId,
          });

        if (yahooSearchError) {
          console.error(
            'Error searching for existing user by yahoo_id:',
            yahooSearchError
          );
          // Continue with user creation if yahoo_id search fails
        } else {
          existingUser = yahooUserData?.[0] || null;
          if (existingUser) {
            console.log('Found existing user by yahoo_id:', existingUser.id);
          }
        }
      }
    }

    let user;
    let userError;

    if (existingUser) {
      console.log('User already exists, updating metadata:', existingUser.id);

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
      console.log('User does not exist, creating new user');

      // Create new user
      const { data: newUser, error: createError } =
        await supabase.auth.admin.createUser({
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
      console.error('User operation failed:', userError);
      return new Response(`User operation failed: ${userError.message}`, {
        status: 400,
        headers: { ...corsHeaders },
      });
    }

    // Return success response with user info
    return new Response(
      JSON.stringify({
        success: true,
        message: 'User authenticated and created successfully',
        user: {
          id: user.user?.id,
          email: user.user?.email,
          name: user.user?.user_metadata?.name,
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
    console.error('OAuth callback error:', error);
    return new Response(`Internal server error: ${error.message}`, {
      status: 500,
      headers: { ...corsHeaders },
    });
  }
}

// Handle OAuth initiation
function handleOAuthInitiation() {
  console.log('Starting OAuth initiation');
  console.log('YAHOO_CLIENT_ID:', YAHOO_CLIENT_ID);
  console.log('REDIRECT_URI:', REDIRECT_URI);

  const authUrl = new URL('https://api.login.yahoo.com/oauth2/request_auth');
  authUrl.searchParams.set('client_id', YAHOO_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', 'oob');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('state', 'fantasy-football-assistant');

  const responseData = {
    auth_url: authUrl.toString(),
  };

  console.log('Generated auth URL:', responseData.auth_url);
  console.log('Returning OAuth initiation response');

  return new Response(JSON.stringify(responseData), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

// Handle token refresh
async function handleTokenRefresh(req: Request) {
  try {
    const { refresh_token } = await req.json();

    if (!refresh_token) {
      return new Response('Refresh token required', {
        status: 400,
        headers: { ...corsHeaders },
      });
    }

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
      return new Response(`Token refresh failed: ${errorText}`, {
        status: 400,
        headers: { ...corsHeaders },
      });
    }

    const tokenData = await tokenResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
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
    console.error('Token refresh error:', error);
    return new Response(`Internal server error: ${error.message}`, {
      status: 500,
      headers: { ...corsHeaders },
    });
  }
}

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/oath' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
