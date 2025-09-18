// CORS headers - shared across all edge functions
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-user-id, apikey, content-type, x-yahoo-token',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};
