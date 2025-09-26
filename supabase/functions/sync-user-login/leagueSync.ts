import { logger } from '../utils/logger.ts';
import { supabase } from '../utils/supabase.ts';
import { makeYahooApiCallWithRetry } from '../utils/syncHelpers.ts';

/**
 * Sync leagues for a user
 */
export async function syncUserLeagues(
  userId: string,
  yahooToken: string
): Promise<number> {
  logger.info('Syncing user leagues', { userId });

  const response = await makeYahooApiCallWithRetry(
    yahooToken,
    'https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/leagues?format=json'
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch leagues: ${response.status}`);
  }

  const data = await response.json();
  const leagues =
    data?.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]
      ?.leagues;

  if (!leagues) {
    logger.warn('No leagues found in response', { userId });
    return 0;
  }

  let processed = 0;

  for (const league of leagues) {
    const leagueData = league.league[0];
    const leagueKey = leagueData.league_key;
    const name = leagueData.name;
    const season = leagueData.season;
    const scoringType = leagueData.scoring_type;

    // Upsert league (only create if doesn't exist)
    const { error } = await supabase.from('leagues').upsert(
      {
        yahoo_league_id: leagueKey,
        name,
        season_year: parseInt(season),
        scoring_type: scoringType,
        roster_positions: leagueData.roster_positions || null,
      },
      {
        onConflict: 'yahoo_league_id',
        ignoreDuplicates: true, // Only insert if doesn't exist
      }
    );

    if (error) {
      logger.error('Failed to upsert league', { error, leagueKey });
    } else {
      processed++;
    }
  }

  logger.info('Completed syncing user leagues', { userId, count: processed });
  return processed;
}

/**
 * Sync teams for a league
 */
export async function syncLeagueTeams(
  leagueId: string,
  leagueKey: string,
  yahooToken: string
): Promise<number> {
  logger.info('Syncing league teams', { leagueId, leagueKey });

  const response = await makeYahooApiCallWithRetry(
    yahooToken,
    `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/teams?format=json`
  );

  if (!response.ok) {
    logger.warn('Failed to fetch teams', {
      leagueId,
      leagueKey,
      status: response.status,
    });
    return 0;
  }

  const data = await response.json();
  const teams = data?.fantasy_content?.league?.[1]?.teams;

  if (!teams) {
    logger.warn('No teams found in response', { leagueId, leagueKey });
    return 0;
  }

  let processed = 0;

  for (const team of teams) {
    const teamData = team.team[0];
    const teamKey = teamData.team_key;
    const name = teamData.name;
    const manager = teamData.managers?.[0]?.manager?.nickname;

    // Get user ID by Yahoo nickname if available
    let userId = null;
    if (manager) {
      const { data: userData } = await supabase
        .from('userProfiles')
        .select('id')
        .eq('user_metadata->yahoo_nickname', manager)
        .single();
      userId = userData?.id;
    }

    // Upsert team (only create if doesn't exist)
    const { error } = await supabase.from('teams').upsert(
      {
        league_id: leagueId,
        yahoo_team_id: teamKey,
        user_id: userId,
        name,
      },
      {
        onConflict: 'yahoo_team_id',
        ignoreDuplicates: true, // Only insert if doesn't exist
      }
    );

    if (error) {
      logger.error('Failed to upsert team', { error, teamKey });
    } else {
      processed++;
    }
  }

  logger.info('Completed syncing league teams', {
    leagueId,
    leagueKey,
    count: processed,
  });
  return processed;
}
