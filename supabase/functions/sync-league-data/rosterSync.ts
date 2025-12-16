import { logger } from '../utils/logger.ts';
import { supabase } from '../utils/supabase.ts';
import { makeYahooApiCall } from '../utils/yahooApi.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface YahooRosterPlayer {
  player_key: string;
  name: { full: string };
  editorial_team_abbr: string;
  primary_position: string;
  selected_position: { position: string };
}

export interface YahooRoster {
  team_key: string;
  players: YahooRosterPlayer[];
}

export interface SyncAllRostersResult {
  success: boolean;
  message: string;
  teamsSynced: number;
  teams: Array<{ id: string; name: string }>;
  errors?: Array<{ teamId: string; error: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch roster for a specific team from Yahoo Fantasy Sports API
 */
export async function fetchTeamRoster(
  accessToken: string,
  teamKey: string
): Promise<YahooRoster | null> {
  try {
    const url = `https://fantasysports.yahooapis.com/fantasy/v2/team/${teamKey}/roster/players?format=json`;

    logger.info('Fetching team roster from Yahoo API', { teamKey });
    const response = await makeYahooApiCall(accessToken, url);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to fetch team roster', {
        teamKey,
        status: response.status,
        error: errorText,
      });
      return null;
    }

    const data = await response.json();
    const rosterData = data?.fantasy_content?.team?.[1]?.roster?.[0]?.players;

    if (!rosterData) {
      logger.warn('No roster data found in Yahoo API response', { teamKey });
      return null;
    }

    const players: YahooRosterPlayer[] = [];

    // Process each player in the roster
    for (const playerKey in rosterData) {
      if (playerKey === 'count') continue;

      const playerWrapper = rosterData[playerKey];
      const playerData = playerWrapper?.player?.[0];
      const selectedPositionData =
        playerWrapper?.player?.[1]?.selected_position;

      if (playerData && Array.isArray(playerData)) {
        const player: YahooRosterPlayer = {
          player_key: playerData[0]?.player_key || '',
          name: {
            full: playerData[2]?.name?.full || '',
          },
          editorial_team_abbr: playerData[9]?.editorial_team_abbr || '',
          primary_position: playerData[17]?.primary_position || '',
          selected_position: {
            position: selectedPositionData?.[1]?.position || '',
          },
        };

        players.push(player);
      }
    }

    logger.info('Successfully fetched team roster', {
      teamKey,
      playerCount: players.length,
    });

    return {
      team_key: teamKey,
      players: players,
    };
  } catch (error) {
    logger.error('Error fetching team roster', { teamKey, error });
    return null;
  }
}

/**
 * Sync roster data to the database
 */
export async function syncTeamRoster(
  teamId: string,
  roster: YahooRoster
): Promise<void> {
  try {
    logger.info('Syncing team roster', {
      teamId,
      teamKey: roster.team_key,
      playerCount: roster.players.length,
    });

    // First, clear existing roster entries for this team
    const { error: deleteError } = await supabase
      .from('roster_entry')
      .delete()
      .eq('team_id', teamId);

    if (deleteError) {
      logger.error('Error clearing existing roster entries', {
        teamId,
        error: deleteError,
      });
      throw deleteError;
    }

    // Process each player in the roster
    for (const player of roster.players) {
      // First, ensure the player exists in the players table
      const { data: existingPlayer, error: playerSearchError } = await supabase
        .from('players')
        .select('id')
        .eq('yahoo_player_id', player.player_key)
        .single();

      if (playerSearchError && playerSearchError.code !== 'PGRST116') {
        logger.error('Error checking for existing player', {
          yahooPlayerId: player.player_key,
          error: playerSearchError,
        });
        continue;
      }

      let playerId: string;

      if (existingPlayer) {
        playerId = existingPlayer.id;
      } else {
        // Create new player
        logger.info('Creating new player', {
          yahooPlayerId: player.player_key,
          name: player.name.full,
        });

        const { data: newPlayer, error: createError } = await supabase
          .from('players')
          .insert({
            yahoo_player_id: player.player_key,
            name: player.name.full,
            team: player.editorial_team_abbr,
            position: player.primary_position,
            status: 'Active',
          })
          .select()
          .single();

        if (createError) {
          logger.error('Error creating player', {
            yahooPlayerId: player.player_key,
            error: createError,
          });
          continue;
        }

        playerId = newPlayer.id;
      }

      // Create roster entry
      const { error: rosterError } = await supabase.from('roster_entry').upsert(
        {
          team_id: teamId,
          player_id: playerId,
          slot: player.selected_position.position,
        },
        {
          onConflict: 'player_id',
        }
      );

      if (rosterError) {
        logger.error('Error creating roster entry', {
          teamId,
          playerId,
          slot: player.selected_position.position,
          error: rosterError,
        });
        continue;
      }
    }

    logger.info('Successfully synced team roster', {
      teamId,
      playerCount: roster.players.length,
    });
  } catch (error) {
    logger.error('Error syncing team roster', { teamId, error });
    throw error;
  }
}

/**
 * Find team in database by Yahoo team key
 */
export async function findTeamByYahooKey(
  yahooTeamKey: string,
  yahooLeagueId: string,
  yahooTeamId: string
): Promise<{ id: string; league_id: string } | null> {
  // Try exact match first
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, league_id')
    .eq('yahoo_team_id', yahooTeamKey)
    .single();

  if (!teamError && team) {
    return team;
  }

  // Try alternative lookup with partial match
  logger.warn('Team not found in database, trying alternative lookup', {
    yahooTeamKey,
    error: teamError,
  });

  const { data: teamAlt, error: teamAltError } = await supabase
    .from('teams')
    .select('id, league_id')
    .like('yahoo_team_id', `%${yahooLeagueId}%${yahooTeamId}%`)
    .single();

  if (teamAltError || !teamAlt) {
    return null;
  }

  return teamAlt;
}

/**
 * Sync rosters for ALL teams in user's leagues
 * Used for periodic roster syncs
 */
export async function syncAllTeamRosters(
  userId: string,
  accessToken: string
): Promise<SyncAllRostersResult> {
  logger.info('Starting all-teams roster sync', { userId });

  // Get all leagues that the user is a member of (through teams)
  const { data: userTeams, error: teamsError } = await supabase
    .from('teams')
    .select('league_id, leagues!inner(id, yahoo_league_id)')
    .eq('user_id', userId);

  if (teamsError) {
    logger.error('Error fetching user teams', { userId, error: teamsError });
    return {
      success: false,
      message: `Failed to fetch user teams: ${teamsError.message}`,
      teamsSynced: 0,
      teams: [],
    };
  }

  if (!userTeams || userTeams.length === 0) {
    logger.warn('No teams found for user', { userId });
    return {
      success: true,
      message: 'No teams found for user',
      teamsSynced: 0,
      teams: [],
    };
  }

  // Extract unique leagues from the teams
  const uniqueLeagues: Array<{ id: string; yahoo_league_id: string }> = [];
  for (const team of userTeams) {
    const leagues = team.leagues as
      | { id: string; yahoo_league_id: string }
      | Array<{ id: string; yahoo_league_id: string }>;

    // Handle both single object and array cases
    const leagueArray = Array.isArray(leagues) ? leagues : [leagues];

    for (const league of leagueArray) {
      if (!uniqueLeagues.find((l) => l.id === league.id)) {
        uniqueLeagues.push(league);
      }
    }
  }

  logger.info('Found user leagues', {
    userId,
    leagueCount: uniqueLeagues.length,
  });

  const syncedTeams: Array<{ id: string; name: string }> = [];
  const errors: Array<{ teamId: string; error: string }> = [];

  // For each league, get ALL teams and sync their rosters
  for (const league of uniqueLeagues) {
    // Get ALL teams in this league (not just user's teams)
    const { data: leagueTeams, error: leagueTeamsError } = await supabase
      .from('teams')
      .select('id, yahoo_team_id, name')
      .eq('league_id', league.id);

    if (leagueTeamsError || !leagueTeams || leagueTeams.length === 0) {
      logger.warn('No teams found in league or error', {
        leagueId: league.id,
        error: leagueTeamsError,
      });
      continue;
    }

    logger.info('Syncing teams in league', {
      leagueId: league.id,
      teamCount: leagueTeams.length,
    });

    // Sync roster for each team in this league
    for (const team of leagueTeams) {
      try {
        const roster = await fetchTeamRoster(accessToken, team.yahoo_team_id);

        if (roster) {
          await syncTeamRoster(team.id, roster);
          syncedTeams.push({ id: team.id, name: team.name });
          logger.info('Synced roster for team', {
            teamId: team.id,
            teamName: team.name,
          });
        } else {
          errors.push({
            teamId: team.id,
            error: 'Failed to fetch roster from Yahoo',
          });
        }
      } catch (error) {
        logger.error('Error syncing roster for team', {
          teamId: team.id,
          error,
        });
        errors.push({
          teamId: team.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  logger.info('All-teams roster sync completed', {
    userId,
    teamsSynced: syncedTeams.length,
    errors: errors.length,
  });

  return {
    success: true,
    message: 'All rosters synced successfully',
    teamsSynced: syncedTeams.length,
    teams: syncedTeams,
    errors: errors.length > 0 ? errors : undefined,
  };
}
