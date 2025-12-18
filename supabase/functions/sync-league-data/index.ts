import { logger, performance } from '../utils/logger.ts';
import { corsHeaders } from '../utils/constants.ts';
import { supabase } from '../utils/supabase.ts';
import { getUserTokens } from '../utils/userTokenManager.ts';
import { startVM } from '../utils/vmManager.ts';
import {
  fetchTeamRoster,
  syncTeamRoster,
  syncAllTeamRosters,
} from './rosterSync.ts';

Deno.serve(async (req) => {
  const timer = performance.start('sync_league_data_request');

  logger.info('League data sync request received', {
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

  if (req.method !== 'POST') {
    logger.warn('Invalid method for league data sync', { method: req.method });
    timer.end();
    return new Response('Method not allowed', {
      status: 405,
      headers: { ...corsHeaders },
    });
  }

  try {
    // Get user data from request body
    const body = await req.json();
    const { userId, syncType = 'full', yahooLeagueId, yahooTeamId } = body;

    if (!userId) {
      logger.error('Missing userId in request body');
      timer.end();
      return new Response(
        JSON.stringify({
          code: 400,
          message: 'Missing userId',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    logger.info('League data sync request for user', {
      userId,
      syncType,
      yahooLeagueId,
      yahooTeamId,
    });

    // Get user's tokens (with automatic refresh if needed) to validate authentication
    const userTokens = await getUserTokens(userId);
    if (!userTokens) {
      logger.error('Failed to get user tokens', { userId });
      timer.end();
      return new Response(
        JSON.stringify({
          code: 401,
          message: 'Failed to get user tokens. Please re-authenticate.',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    logger.info('User authentication validated', { userId });

    // ─────────────────────────────────────────────────────────────────────────
    // IMMEDIATE SINGLE TEAM SYNC: Synchronously sync a single team's roster
    // Used for post-triggered syncs (e.g., after user edits roster)
    // ─────────────────────────────────────────────────────────────────────────
    if (syncType === 'immediate-roster' && yahooLeagueId && yahooTeamId) {
      return await handleImmediateRosterSync(
        timer,
        userId,
        userTokens.access_token,
        yahooLeagueId,
        yahooTeamId
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // IMMEDIATE ALL TEAMS SYNC: Synchronously sync all teams for a user
    // Used for periodic roster syncs
    // ─────────────────────────────────────────────────────────────────────────
    if (syncType === 'immediate-roster-all') {
      return await handleImmediateAllRosterSync(
        timer,
        userId,
        userTokens.access_token
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FIRST-TIME INITIALIZATION: Create all jobs needed for a new user
    // Used when syncType is 'full' or 'initialize' and user has no existing data
    // ─────────────────────────────────────────────────────────────────────────
    if (syncType === 'full' || syncType === 'initialize') {
      const needsInit = await needsInitialization(userId);
      if (needsInit) {
        return await handleFirstTimeInitialization(timer, userId);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // JOB-BASED SYNC: Create a job for the VM to process
    // Used for full syncs (leagues, teams, settings, etc.)
    // ─────────────────────────────────────────────────────────────────────────
    return await handleJobBasedSync(timer, userId, syncType);
  } catch (error) {
    logger.error('League data sync error', { error });
    timer.end();
    return new Response(
      JSON.stringify({
        success: false,
        message: 'League data sync failed',
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Handler functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle immediate roster sync for a single team
 */
async function handleImmediateRosterSync(
  timer: ReturnType<typeof performance.start>,
  userId: string,
  accessToken: string,
  yahooLeagueId: string,
  yahooTeamId: string
): Promise<Response> {
  logger.info('Starting immediate single-team roster sync', {
    userId,
    yahooLeagueId,
    yahooTeamId,
  });

  // Find team in database first using pattern match on league/team IDs
  // This avoids hardcoding the game key (e.g., 449) which can change by season
  const teamKeyPattern = `.l.${yahooLeagueId}.t.${yahooTeamId}`;
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, league_id, yahoo_team_id')
    .like('yahoo_team_id', `%${teamKeyPattern}`)
    .single();

  if (teamError || !team) {
    logger.error('Team not found in database', {
      yahooLeagueId,
      yahooTeamId,
      pattern: teamKeyPattern,
      error: teamError,
    });
    timer.end();
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Team not found in database',
      }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  // Fetch roster from Yahoo API using the actual stored team key
  const roster = await fetchTeamRoster(accessToken, team.yahoo_team_id);

  if (!roster) {
    timer.end();
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed to fetch roster from Yahoo',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  // Sync the roster
  await syncTeamRoster(team.id, roster);

  const duration = timer.end();
  logger.info('Immediate roster sync completed', {
    duration: `${duration}ms`,
    userId,
    teamId: team.id,
  });

  return new Response(
    JSON.stringify({
      success: true,
      message: 'Roster synced successfully',
      teamId: team.id,
      leagueId: team.league_id,
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Handle immediate roster sync for ALL teams in user's leagues
 * Used for periodic roster syncs
 */
async function handleImmediateAllRosterSync(
  timer: ReturnType<typeof performance.start>,
  userId: string,
  accessToken: string
): Promise<Response> {
  const result = await syncAllTeamRosters(userId, accessToken);

  const duration = timer.end();
  logger.info('Immediate all-teams roster sync completed', {
    duration: `${duration}ms`,
    userId,
    teamsSynced: result.teamsSynced,
    errors: result.errors?.length || 0,
  });

  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle job-based sync (creates a job for the VM to process)
 */
async function handleJobBasedSync(
  timer: ReturnType<typeof performance.start>,
  userId: string,
  syncType: string
): Promise<Response> {
  const jobName =
    syncType === 'roster' ? 'sync-team-roster-only' : 'sync-league-data';

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .insert({
      name: jobName,
      status: 'pending',
      user_id: userId,
      priority: 100, // Normal priority for user-triggered jobs (default)
    })
    .select()
    .single();

  if (jobError) {
    logger.error('Failed to create job', {
      userId,
      syncType,
      error: jobError,
    });
    timer.end();
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed to create sync job',
        error: jobError.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  logger.info('Job created successfully', {
    jobId: job.id,
    jobName: job.name,
    userId,
    syncType,
  });

  // Start the VM
  await startVM();

  const duration = timer.end();
  logger.info('Completed league data sync setup', {
    duration: `${duration}ms`,
    userId,
    syncType,
  });

  return new Response(
    JSON.stringify({
      success: true,
      message: 'League data sync job created successfully',
      jobId: job.id,
      status: 'pending',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    }
  );
}

/**
 * Handle first-time user initialization
 * Creates all the jobs needed to fully set up a user's league data
 */
async function handleFirstTimeInitialization(
  timer: ReturnType<typeof performance.start>,
  userId: string
): Promise<Response> {
  logger.info('Starting first-time user initialization', { userId });

  // Step 1: Create the sync-league-data job (highest priority)
  const { data: leagueSyncJob, error: leagueSyncError } = await supabase
    .from('jobs')
    .insert({
      name: 'sync-league-data',
      status: 'pending',
      user_id: userId,
      priority: 1, // Highest priority - must run first
    })
    .select()
    .single();

  if (leagueSyncError) {
    logger.error('Failed to create league sync job', {
      userId,
      error: leagueSyncError,
    });
    timer.end();
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed to create initialization jobs',
        error: leagueSyncError.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  // Step 2: Create the "all weeks" calculation jobs
  // These run in sequence after league data is synced
  const initJobs = [
    { name: 'fantasy-points-calc-all-weeks', priority: 10 },
    { name: 'sync-defense-points-against-all-weeks', priority: 20 },
    { name: 'sync-team-offensive-stats-all-weeks', priority: 30 },
    { name: 'league-calcs-all-weeks', priority: 40 },
  ];

  const { error: initJobsError } = await supabase.from('jobs').insert(
    initJobs.map((job) => ({
      name: job.name,
      status: 'pending',
      user_id: userId,
      priority: job.priority,
    }))
  );

  if (initJobsError) {
    logger.error('Failed to create initialization jobs', {
      userId,
      error: initJobsError,
    });
    // Don't fail completely - the league sync job was already created
  }

  logger.info('Created initialization jobs', {
    userId,
    leagueSyncJobId: leagueSyncJob.id,
    initJobCount: initJobs.length,
  });

  // Step 3: Start the VM to process all jobs
  await startVM();

  const duration = timer.end();
  logger.info('First-time initialization setup complete', {
    duration: `${duration}ms`,
    userId,
  });

  return new Response(
    JSON.stringify({
      success: true,
      message: 'First-time initialization started',
      status: 'initializing',
      total_jobs: initJobs.length + 1, // +1 for the league sync job
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Check if a user needs first-time initialization
 */
async function needsInitialization(userId: string): Promise<boolean> {
  // Check if user has any teams (leagues) set up
  const { data: userTeams, error } = await supabase
    .from('teams')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  if (error) {
    logger.error('Error checking if user needs initialization', {
      userId,
      error,
    });
    return false; // Assume no initialization needed on error
  }

  // If user has no teams, they need initialization
  return !userTeams || userTeams.length === 0;
}
