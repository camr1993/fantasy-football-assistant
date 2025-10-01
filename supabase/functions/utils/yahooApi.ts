import { logger } from './logger.ts';

/**
 * Make a Yahoo API call using the provided access token
 * Client is responsible for ensuring the token is valid and refreshed
 */
export async function makeYahooApiCall(
  accessToken: string,
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  if (!accessToken) {
    throw new Error('Yahoo access token is required');
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  return fetch(url, {
    ...options,
    headers,
  });
}
