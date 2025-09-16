import { logger } from '../utils/logger.ts';
import {
  corsHeaders,
  YAHOO_CLIENT_ID,
  REDIRECT_URI,
} from '../utils/constants.ts';
import { generateNonce } from '../utils/nonce.ts';

// Handle OAuth initiation
export function handleOAuthInitiation() {
  logger.info('Starting OAuth initiation', {
    clientId: YAHOO_CLIENT_ID,
    redirectUri: REDIRECT_URI,
  });

  // Generate a unique nonce for this request
  const nonce = generateNonce();
  logger.info('Generated nonce for OAuth request', { nonce });

  // Nonce will be stored in Chrome storage by the popup

  const authUrl = new URL('https://api.login.yahoo.com/oauth2/request_auth');
  authUrl.searchParams.set('client_id', YAHOO_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('state', 'fantasy-football-assistant');
  authUrl.searchParams.set('nonce', nonce);

  const responseData = {
    auth_url: authUrl.toString(),
    nonce: nonce,
  };

  logger.info('Generated OAuth URL', { authUrl: responseData.auth_url });

  return new Response(JSON.stringify(responseData), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}
