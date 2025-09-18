// OAuth configuration
export const YAHOO_CLIENT_ID = Deno.env.get('YAHOO_CLIENT_ID')!;
export const YAHOO_CLIENT_SECRET = Deno.env.get('YAHOO_CLIENT_SECRET')!;
export const REDIRECT_URI = 'oob';

// CORS headers
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-user-id, apikey, content-type, x-yahoo-token',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};
