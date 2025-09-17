import { logger, performance } from './utils/logger.ts';
import { corsHeaders } from './utils/constants.ts';
import { handleOAuthCallback } from './handlers/oauth-callback.ts';
import { handleOAuthInitiation } from './handlers/oauth-initiation.ts';
import { handleTokenRefresh } from './handlers/token-refresh.ts';

Deno.serve(async (req) => {
  const timer = performance.start('total_request');

  logger.info('Request received', {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries()),
  });

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    logger.info('Handling CORS preflight request');
    timer.end();
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  const url = new URL(req.url);
  const path = url.pathname;
  logger.info('Processing request', { path });

  // Handle OAuth initiation (requires auth header)
  if (path.endsWith('/auth')) {
    logger.info('Handling OAuth initiation');
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      logger.warn('Missing authorization header for /auth route');
      timer.end();
      return new Response(
        JSON.stringify({ code: 401, message: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    timer.end();
    return handleOAuthInitiation();
  }

  // Handle OAuth callback (includes auth header)
  if (path.endsWith('/callback')) {
    logger.info('Handling OAuth callback');
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      logger.warn('Missing authorization header for /callback route');
      timer.end();
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
    logger.info('Handling token refresh');
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      logger.warn('Missing authorization header for /refresh route');
      timer.end();
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

  logger.warn('No matching route found, returning 404', { path });
  timer.end();
  return new Response('Not Found', { status: 404 });
});
