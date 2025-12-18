import { logger, performance } from '../../supabase/functions/utils/logger.ts';
import { supabase } from '../../supabase/functions/utils/supabase.ts';
import { getUserTokens } from '../../supabase/functions/utils/userTokenManager.ts';

// Import all sync functions
import { syncAllPlayers } from './sync-functions/playerSync.ts';
import { syncAllPlayerInjuries } from './sync-functions/injurySync.ts';
import { syncAllPlayerStats } from './sync-functions/sync-player-stats/index.ts';
import { syncNflMatchups } from './sync-functions/syncNflMatchups.ts';
import { syncOpponents } from './sync-functions/syncOpponents.ts';
import {
  syncUserLeagues,
  syncTeamRosterOnly,
} from './sync-functions/leagueSync.ts';
import {
  syncDefensePointsAgainst,
  syncDefensePointsAgainstAllWeeks,
} from './sync-functions/syncDefensePointsAgainst.ts';
import {
  syncTeamOffensiveStats,
  syncTeamOffensiveStatsAllWeeks,
} from './sync-functions/syncTeamOffensiveStats.ts';
import {
  calculateAllLeaguesFantasyPoints,
  calculateAllLeaguesFantasyPointsAllWeeks,
} from './sync-functions/fantasyPointsCalc.ts';
import {
  calculateRecentStatsOnly,
  calculateRecentStatsAllWeeks,
} from './sync-functions/leagueCalcs/index.ts';
import { getMostRecentNFLWeek } from '../../supabase/functions/utils/syncHelpers.ts';
import { createServer } from 'node:http';

interface Job {
  id: string;
  name: string;
  status: string;
  week?: number;
  user_id?: string;
  priority?: number;
  run_time?: number;
  created_at: string;
  updated_at: string;
}

interface SyncFunction {
  name: string;
  fn: (yahooToken: string, week?: number, userId?: string) => Promise<any>;
}

const SYNC_FUNCTIONS: Record<string, SyncFunction> = {
  'sync-players': {
    name: 'sync-players',
    fn: syncAllPlayers,
  },
  'sync-injuries': {
    name: 'sync-injuries',
    fn: syncAllPlayerInjuries,
  },
  'sync-player-stats': {
    name: 'sync-player-stats',
    fn: syncAllPlayerStats,
  },
  'sync-nfl-matchups': {
    name: 'sync-nfl-matchups',
    fn: () => syncNflMatchups(),
  },
  'sync-opponents': {
    name: 'sync-opponents',
    fn: (_yahooToken: string, week?: number) => syncOpponents(week),
  },
  'sync-league-data': {
    name: 'sync-league-data',
    fn: (yahooToken: string, _week?: number, userId?: string) =>
      syncUserLeagues(
        userId || Deno.env.get('SUPER_ADMIN_USER_ID') || '',
        yahooToken
      ),
  },
  'sync-team-roster-only': {
    name: 'sync-team-roster-only',
    fn: (yahooToken: string, _week?: number, userId?: string) =>
      syncTeamRosterOnly(
        userId || Deno.env.get('SUPER_ADMIN_USER_ID') || '',
        yahooToken
      ),
  },
  'fantasy-points-calc': {
    name: 'fantasy-points-calc',
    fn: (_yahooToken: string, week?: number) =>
      calculateAllLeaguesFantasyPoints(
        new Date().getFullYear(),
        week ?? getMostRecentNFLWeek()
      ),
  },
  'sync-defense-points-against': {
    name: 'sync-defense-points-against',
    fn: (_yahooToken: string, week?: number) => syncDefensePointsAgainst(week),
  },
  'sync-team-offensive-stats': {
    name: 'sync-team-offensive-stats',
    fn: (_yahooToken: string, week?: number) => syncTeamOffensiveStats(week),
  },
  'league-calcs': {
    name: 'league-calcs',
    fn: (_yahooToken: string, week?: number) =>
      calculateRecentStatsOnly(undefined, new Date().getFullYear(), week),
  },
  // "All weeks" variants for initial league setup (scoped to user's leagues)
  'fantasy-points-calc-all-weeks': {
    name: 'fantasy-points-calc-all-weeks',
    fn: (_yahooToken: string, week?: number, userId?: string) =>
      calculateAllLeaguesFantasyPointsAllWeeks(
        new Date().getFullYear(),
        week,
        userId
      ),
  },
  'sync-defense-points-against-all-weeks': {
    name: 'sync-defense-points-against-all-weeks',
    fn: (_yahooToken: string, week?: number, userId?: string) =>
      syncDefensePointsAgainstAllWeeks(week, userId),
  },
  'sync-team-offensive-stats-all-weeks': {
    name: 'sync-team-offensive-stats-all-weeks',
    fn: (_yahooToken: string, week?: number, userId?: string) =>
      syncTeamOffensiveStatsAllWeeks(week, userId),
  },
  'league-calcs-all-weeks': {
    name: 'league-calcs-all-weeks',
    fn: (_yahooToken: string, week?: number, userId?: string) =>
      calculateRecentStatsAllWeeks(
        undefined,
        new Date().getFullYear(),
        week,
        userId
      ),
  },
};

async function getNextJob(): Promise<Job | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'pending')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows returned
    logger.error('Failed to fetch next job', { error });
    return null;
  }

  return data;
}

async function updateJobStatus(
  jobId: string,
  status: string,
  errorMessage?: string,
  runTime?: number
) {
  const updateData: any = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (errorMessage) {
    updateData.error_message = errorMessage;
  }

  // Always set run_time if provided (including 0)
  // This ensures the trigger can read NEW.run_time when moving to history
  if (runTime !== undefined && runTime !== null) {
    updateData.run_time = runTime;
  }

  const { error } = await supabase
    .from('jobs')
    .update(updateData)
    .eq('id', jobId);

  if (error) {
    logger.error('Failed to update job status', { jobId, status, error });
  }
}

async function runJob(job: Job): Promise<boolean> {
  const syncFunction = SYNC_FUNCTIONS[job.name];

  if (!syncFunction) {
    logger.error('Unknown job type', { jobName: job.name });
    await updateJobStatus(job.id, 'failed', `Unknown job type: ${job.name}`);
    return false;
  }

  logger.info('Starting job', {
    jobId: job.id,
    jobName: job.name,
    week: job.week,
  });

  // Start timing for run_time tracking
  const startTime = Date.now();

  // Update job status to running
  await updateJobStatus(job.id, 'running');

  try {
    // Get Yahoo tokens - use job's user_id if present, otherwise use SUPER_ADMIN_USER
    let userId: string;
    if (job.user_id) {
      userId = job.user_id;
      logger.info('Using user-specific tokens for job', {
        jobId: job.id,
        userId: job.user_id,
      });
    } else {
      const superAdminUserId = Deno.env.get('SUPER_ADMIN_USER_ID');
      if (!superAdminUserId) {
        throw new Error('SUPER_ADMIN_USER_ID environment variable not set');
      }
      userId = superAdminUserId;
      logger.info('Using super admin tokens for job', {
        jobId: job.id,
        jobName: job.name,
      });
    }

    const userTokens = await getUserTokens(userId);
    if (!userTokens) {
      throw new Error(`Failed to get Yahoo tokens for user ${userId}`);
    }

    // Run the sync function
    const timer = performance.start(`job-${job.name}`);
    let recordsProcessed = 0;

    let result: any;
    result = await syncFunction.fn(
      userTokens.access_token,
      job.week ?? undefined,
      job.user_id
    );

    // Extract records processed from different return types
    if (typeof result === 'number') {
      recordsProcessed = result;
    } else if (result && typeof result === 'object') {
      recordsProcessed =
        result.updated_count ||
        result.leagues?.length ||
        result.teams?.length ||
        0;
    }

    const duration = timer.end();
    const runTime = Date.now() - startTime; // Calculate run time in milliseconds

    logger.info('Job completed successfully', {
      jobId: job.id,
      jobName: job.name,
      recordsProcessed,
      duration: `${duration}ms`,
      runTimeMs: runTime,
    });

    // Update job status to completed with run_time
    await updateJobStatus(job.id, 'completed', undefined, runTime);
    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const runTime = Date.now() - startTime; // Calculate run time even for failed jobs

    logger.error('Job failed', {
      jobId: job.id,
      jobName: job.name,
      error: errorMessage,
      runTimeMs: runTime,
    });

    await updateJobStatus(job.id, 'failed', errorMessage, runTime);
    return false;
  }
}

async function stopVM(server?: any) {
  logger.info('No more jobs found, stopping VM...');

  try {
    const vmAppName =
      Deno.env.get('FLY_APP_NAME') || 'fantasy-football-assistant-vm';
    const flyApiToken = Deno.env.get('FLY_API_TOKEN');

    if (!flyApiToken) {
      logger.error(
        'FLY_API_TOKEN environment variable not set for VM management'
      );
      return;
    }

    // First, list all machines to find the one to stop
    const listResponse = await fetch(
      `https://api.machines.dev/v1/apps/${vmAppName}/machines`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${flyApiToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      logger.error('Failed to list machines', {
        status: listResponse.status,
        errorText,
        appName: vmAppName,
      });
      return;
    }

    const machines = await listResponse.json();
    logger.info('Retrieved machines for stop', {
      count: machines.length,
      appName: vmAppName,
    });

    // If we have machines, stop the first one
    if (machines.length > 0) {
      const machine = machines[0];
      logger.info('Found machine to stop', {
        machineId: machine.id,
        machineName: machine.name,
        currentState: machine.state,
      });

      const stopResponse = await fetch(
        `https://api.machines.dev/v1/apps/${vmAppName}/machines/${machine.id}/stop`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${flyApiToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (stopResponse.ok) {
        logger.info('Machine stop command sent successfully', {
          machineId: machine.id,
          appName: vmAppName,
        });
      } else {
        const errorText = await stopResponse.text();
        logger.error('Failed to stop machine', {
          status: stopResponse.status,
          errorText,
          machineId: machine.id,
        });
      }
    } else {
      logger.warn('No machines found to stop', { appName: vmAppName });
    }
  } catch (error) {
    logger.error('Error stopping VM', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Close server if provided
  if (server) {
    server.close(() => {
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

async function main() {
  logger.info('🚀 VM starting job processing', {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
  });

  // Set up HTTP server for health checks
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
        })
      );
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  server.listen(3000, () => {
    logger.info('Health check server started on port 3000');
  });

  // Set up graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('🛑 Received SIGTERM, shutting down gracefully...');
    server.close(() => {
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('🛑 Received SIGINT, shutting down gracefully...');
    server.close(() => {
      process.exit(0);
    });
  });

  // Set up timeout to prevent VM from running forever
  const maxRuntime = 180 * 60 * 1000; // 3 hours
  const timeoutId = setTimeout(() => {
    logger.warn('VM runtime exceeded maximum time, stopping...');
    stopVM(server);
  }, maxRuntime);

  try {
    let jobsProcessed = 0;
    const maxJobs = 50; // Prevent infinite loops

    while (jobsProcessed < maxJobs) {
      const job = await getNextJob();

      if (!job) {
        logger.info('No more jobs found, stopping VM', { jobsProcessed });
        clearTimeout(timeoutId);
        await stopVM(server);
        return;
      }

      const success = await runJob(job);
      jobsProcessed++;

      if (!success) {
        logger.warn('Job failed, continuing with next job', { jobId: job.id });
      }

      // Small delay between jobs to prevent overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    logger.warn('Maximum jobs processed, stopping VM', { jobsProcessed });
    clearTimeout(timeoutId);
    await stopVM(server);
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('❌ VM job processing failed', { error: errorMessage });
    await stopVM(server);
  }
}

// Start the process
main().catch((error) => {
  logger.error('Failed to start VM', { error: error.message });
  process.exit(1);
});
