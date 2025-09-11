import { createClient } from '@supabase/supabase-js';

// Types for the response
interface User {
  id: string;
  name: string;
  email?: string;
  created_at?: string;
}

interface TestUsersResponse {
  users: User[];
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { data: users, error } = await supabase.from('testUsers').select('*');
    if (error) throw error;

    const response: TestUsersResponse = { users: users || [] };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error in test-fetch-data:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch users',
        users: [],
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
