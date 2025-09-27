import { logger } from './logger.ts';

/**
 * Get Yahoo access token using client credentials
 */
export async function getYahooAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string | null> {
  try {
    const response = await fetch(
      'https://api.login.yahoo.com/oauth2/token?format=json',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }),
      }
    );

    if (!response.ok) {
      const responseText = await response.text();
      logger.error('Failed to get Yahoo access token', {
        status: response.status,
        statusText: response.statusText,
        responseBody: responseText.substring(0, 500), // Log first 500 chars
      });
      return null;
    }

    const responseText = await response.text();
    try {
      const data = JSON.parse(responseText);
      return data.access_token;
    } catch (parseError) {
      logger.error('Failed to parse Yahoo API response as JSON', {
        parseError: parseError.message,
        responseBody: responseText.substring(0, 500), // Log first 500 chars
        contentType: response.headers.get('content-type'),
      });
      return null;
    }
  } catch (error) {
    logger.error('Error getting Yahoo access token', { error: error.message });
    return null;
  }
}

/**
 * Get Yahoo API credentials from environment variables
 */
export function getYahooCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = Deno.env.get('YAHOO_CLIENT_ID');
  const clientSecret = Deno.env.get('YAHOO_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    logger.error('Yahoo API credentials not configured');
    return null;
  }

  return { clientId, clientSecret };
}
