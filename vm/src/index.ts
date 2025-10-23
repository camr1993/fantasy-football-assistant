// import { logger, performance } from '../../supabase/functions/utils/logger.ts';
// import { supabase } from '../../supabase/functions/utils/supabase.ts';
// import { getUserTokens } from '../../supabase/functions/utils/userTokenManager.ts';

// Import all sync functions
// import { syncAllPlayers } from './sync-functions/playerSync.ts';
// import { syncAllPlayerInjuries } from './sync-functions/injurySync.ts';
// import { syncAllPlayerStats } from './sync-functions/syncPlayerStats.ts';
// import { syncNflMatchups } from './sync-functions/syncNflMatchups.ts';
// import { syncOpponents } from './sync-functions/syncOpponents.ts';
// import { syncUserLeagues } from './sync-functions/leagueSync.ts';
// import { syncDefensePointsAgainst } from './sync-functions/syncDefensePointsAgainst.ts';
// import { handleLeagueCalculations } from './sync-functions/leagueCalcs.ts';
import { createServer } from 'http';
import { logger } from './logger.ts';

// interface Job {
//   id: string;
//   name: string;
//   status: string;
//   week?: number;
//   created_at: string;
//   updated_at: string;
// }

// interface SyncFunction {
//   name: string;
//   fn: (yahooToken: string, week?: number) => Promise<any>;
//   requiresWeek: boolean;
// }

// const SYNC_FUNCTIONS: Record<string, SyncFunction> = {
//   'sync-players': {
//     name: 'sync-players',
//     fn: syncAllPlayers,
//     requiresWeek: false,
//   },
//   'sync-injuries': {
//     name: 'sync-injuries',
//     fn: syncAllPlayerInjuries,
//     requiresWeek: false,
//   },
//   'sync-player-stats': {
//     name: 'sync-player-stats',
//     fn: syncAllPlayerStats,
//     requiresWeek: true,
//   },
//   'sync-nfl-matchups': {
//     name: 'sync-nfl-matchups',
//     fn: () => syncNflMatchups(),
//     requiresWeek: false,
//   },
//   'sync-opponents': {
//     name: 'sync-opponents',
//     fn: (yahooToken: string, week?: number) => syncOpponents(week),
//     requiresWeek: true,
//   },
//   'sync-league-data': {
//     name: 'sync-league-data',
//     fn: (yahooToken: string) =>
//       syncUserLeagues(process.env.SUPER_ADMIN_USER_ID || '', yahooToken),
//     requiresWeek: false,
//   },
//   'sync-defense-points-against': {
//     name: 'sync-defense-points-against',
//     fn: (yahooToken: string, week?: number) => syncDefensePointsAgainst(week),
//     requiresWeek: false,
//   },
//   'league-calcs': {
//     name: 'league-calcs',
//     fn: (yahooToken: string, week?: number) =>
//       handleLeagueCalculations({
//         season_year: new Date().getFullYear(),
//         week: week,
//         recalculate_all: false,
//       }),
//     requiresWeek: true,
//   },
// };

// async function getNextJob(): Promise<Job | null> {
//   const { data, error } = await supabase
//     .from('jobs')
//     .select('*')
//     .eq('status', 'pending')
//     .order('created_at', { ascending: true })
//     .limit(1)
//     .single();

//   if (error && error.code !== 'PGRST116') {
//     // PGRST116 = no rows returned
//     logger.error('Failed to fetch next job', { error });
//     return null;
//   }

//   return data;
// }

// async function updateJobStatus(
//   jobId: string,
//   status: string,
//   errorMessage?: string
// ) {
//   const updateData: any = {
//     status,
//     updated_at: new Date().toISOString(),
//   };

//   if (errorMessage) {
//     updateData.error_message = errorMessage;
//   }

//   const { error } = await supabase
//     .from('jobs')
//     .update(updateData)
//     .eq('id', jobId);

//   if (error) {
//     logger.error('Failed to update job status', { jobId, status, error });
//   }
// }

// async function runJob(job: Job): Promise<boolean> {
//   const syncFunction = SYNC_FUNCTIONS[job.name];

//   if (!syncFunction) {
//     logger.error('Unknown job type', { jobName: job.name });
//     await updateJobStatus(job.id, 'failed', `Unknown job type: ${job.name}`);
//     return false;
//   }

//   logger.info('Starting job', {
//     jobId: job.id,
//     jobName: job.name,
//     week: job.week,
//   });

//   // Update job status to running
//   await updateJobStatus(job.id, 'running');

//   try {
//     // Get Yahoo tokens
//     const superAdminUserId = process.env.SUPER_ADMIN_USER_ID;
//     if (!superAdminUserId) {
//       throw new Error('SUPER_ADMIN_USER_ID environment variable not set');
//     }

//     const userTokens = await getUserTokens(superAdminUserId);
//     if (!userTokens) {
//       throw new Error('Failed to get user Yahoo tokens');
//     }

//     // Run the sync function
//     const timer = performance.start(`job-${job.name}`);
//     let recordsProcessed = 0;

//     let result: any;
//     if (syncFunction.requiresWeek && job.week) {
//       result = await syncFunction.fn(userTokens.access_token, job.week);
//     } else if (syncFunction.requiresWeek && !job.week) {
//       throw new Error(
//         `Job ${job.name} requires a week parameter but none was provided`
//       );
//     } else {
//       result = await syncFunction.fn(userTokens.access_token);
//     }

//     // Extract records processed from different return types
//     if (typeof result === 'number') {
//       recordsProcessed = result;
//     } else if (result && typeof result === 'object') {
//       recordsProcessed =
//         result.updated_count ||
//         result.leagues?.length ||
//         result.teams?.length ||
//         0;
//     }

//     const duration = timer.end();

//     logger.info('Job completed successfully', {
//       jobId: job.id,
//       jobName: job.name,
//       recordsProcessed,
//       duration: `${duration}ms`,
//     });

//     // Update job status to completed
//     await updateJobStatus(job.id, 'completed');
//     return true;
//   } catch (error: unknown) {
//     const errorMessage = error instanceof Error ? error.message : String(error);
//     logger.error('Job failed', {
//       jobId: job.id,
//       jobName: job.name,
//       error: errorMessage,
//     });

//     await updateJobStatus(job.id, 'failed', errorMessage);
//     return false;
//   }
// }

async function stopVM(server?: any) {
  logger.info('No more jobs found, stopping VM...');

  try {
    // Use Fly API to stop the current machine
    const machineId = process.env.FLY_MACHINE_ID;
    if (machineId) {
      const response = await fetch(
        `https://api.machines.dev/v1/apps/${process.env.FLY_APP_NAME}/machines/${machineId}/stop`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.FLY_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        logger.info('VM stop command sent successfully');
      } else {
        logger.error('Failed to send VM stop command', {
          status: response.status,
        });
      }
    } else {
      logger.warn('FLY_MACHINE_ID not found, cannot stop VM programmatically');
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

  // try {
  //   let jobsProcessed = 0;
  //   const maxJobs = 50; // Prevent infinite loops

  //   while (jobsProcessed < maxJobs) {
  //     const job = await getNextJob();

  //     if (!job) {
  //       logger.info('No more jobs found, stopping VM', { jobsProcessed });
  //       clearTimeout(timeoutId);
  //       await stopVM(server);
  //       return;
  //     }

  //     const success = await runJob(job);
  //     jobsProcessed++;

  //     if (!success) {
  //       logger.warn('Job failed, continuing with next job', { jobId: job.id });
  //     }

  //     // Small delay between jobs to prevent overwhelming the system
  //     await new Promise((resolve) => setTimeout(resolve, 1000));
  //   }

  //   logger.warn('Maximum jobs processed, stopping VM', { jobsProcessed });
  //   clearTimeout(timeoutId);
  //   await stopVM(server);
  // } catch (error: unknown) {
  //   clearTimeout(timeoutId);
  //   const errorMessage = error instanceof Error ? error.message : String(error);
  //   logger.error('❌ VM job processing failed', { error: errorMessage });
  //   await stopVM(server);
  // }
}

// Start the process
main().catch((error) => {
  logger.error('Failed to start VM', { error: error.message });
  process.exit(1);
});
