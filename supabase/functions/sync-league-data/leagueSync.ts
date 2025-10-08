import { logger } from '../utils/logger.ts';
import { makeYahooApiCall } from '../utils/yahooApi.ts';
import { supabase } from '../utils/supabase.ts';

export interface YahooLeague {
  league_key: string;
  league_id: string;
  name: string;
  season: string;
  scoring_type: string;
  roster_positions?: Record<string, unknown>;
}

export interface YahooTeam {
  team_key: string;
  team_id: string;
  name: string;
  league_key: string;
  is_owned_by_current_login: boolean;
}

export interface YahooRosterPlayer {
  player_key: string;
  player_id: string;
  name: {
    full: string;
    first: string;
    last: string;
    ascii_first: string;
    ascii_last: string;
  };
  editorial_player_key: string;
  editorial_team_key: string;
  editorial_team_full_name: string;
  editorial_team_abbr: string;
  bye_weeks: {
    week: string;
  };
  uniform_number: string;
  display_position: string;
  headshot: {
    url: string;
    size: string;
  };
  image_url: string;
  is_undroppable: string;
  position_type: string;
  primary_position: string;
  eligible_positions: {
    position: string[];
  };
  has_player_notes: string;
  player_notes_last_timestamp: string;
  selected_position: {
    coverage_type: string;
    is_flex: string;
    position: string;
  };
}

export interface YahooRoster {
  team_key: string;
  players: YahooRosterPlayer[];
}

export interface YahooStatModifier {
  stat_id: number;
  value: number;
  display_name: string;
}

export interface YahooLeagueSettings {
  league_key: string;
  stat_modifiers: YahooStatModifier[];
}

/**
 * Fetch user's leagues from Yahoo Fantasy Sports API
 */
export async function fetchUserLeagues(
  accessToken: string
): Promise<YahooLeague[]> {
  try {
    const url =
      'https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/leagues?format=json';

    logger.info('Fetching user leagues from Yahoo API');
    const response = await makeYahooApiCall(accessToken, url);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to fetch user leagues', {
        status: response.status,
        error: errorText,
      });
      throw new Error(`Yahoo API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    logger.info('Yahoo API response structure', {
      hasFantasyContent: !!data?.fantasy_content,
      hasUsers: !!data?.fantasy_content?.users,
    });

    // Parse the response according to actual Yahoo API structure
    // Structure: fantasy_content.users["0"].user[1].games["0"].game[1].leagues
    const users = data?.fantasy_content?.users;
    if (!users || !users['0']) {
      logger.warn('No users found in Yahoo API response');
      return [];
    }

    const user = users['0']?.user;
    if (!user || user.length < 2) {
      logger.warn('Invalid user structure in Yahoo API response');
      return [];
    }

    const games = user[1]?.games;
    if (!games || !games['0']) {
      logger.warn('No games found in Yahoo API response');
      return [];
    }

    const game = games['0']?.game;
    if (!game || game.length < 2) {
      logger.warn('Invalid game structure in Yahoo API response');
      return [];
    }

    const leaguesObj = game[1]?.leagues;
    if (!leaguesObj || !leaguesObj['0']) {
      logger.warn('No leagues found in Yahoo API response');
      return [];
    }

    const leagues: YahooLeague[] = [];

    // Process each league (leaguesObj has numeric string keys like "0", "1", etc.)
    for (const leagueKey in leaguesObj) {
      if (leagueKey === 'count') continue;

      const leagueWrapper = leaguesObj[leagueKey];
      const leagueData = leagueWrapper?.league?.[0];
      if (leagueData) {
        leagues.push({
          league_key: leagueData.league_key,
          league_id: leagueData.league_id,
          name: leagueData.name,
          season: leagueData.season,
          scoring_type: leagueData.scoring_type,
          roster_positions: leagueData.roster_positions,
        });
      }
    }

    logger.info('Successfully fetched user leagues', { count: leagues.length });
    return leagues;
  } catch (error) {
    logger.error('Error fetching user leagues', { error });
    throw error;
  }
}

/**
 * Fetch league settings including stat modifiers from Yahoo Fantasy Sports API
 */
export async function fetchLeagueSettings(
  accessToken: string,
  leagueKey: string
): Promise<YahooLeagueSettings | null> {
  try {
    const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/settings?format=json`;

    logger.info('Fetching league settings from Yahoo API', { leagueKey });
    const response = await makeYahooApiCall(accessToken, url);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to fetch league settings', {
        leagueKey,
        status: response.status,
        error: errorText,
      });
      return null;
    }

    const data = await response.json();
    const settings = data?.fantasy_content?.league?.[1]?.settings?.[0];

    if (!settings) {
      logger.warn('No settings found in Yahoo API response', { leagueKey });
      return null;
    }

    // Extract stat modifiers from the settings
    const statModifiers: YahooStatModifier[] = [];
    const statModifiersData = settings.stat_modifiers?.stats;

    if (statModifiersData && Array.isArray(statModifiersData)) {
      // Get all valid stat_ids from stat_definitions table
      const { data: statDefinitions, error: statDefError } = await supabase
        .from('stat_definitions')
        .select('stat_id');

      if (statDefError) {
        logger.warn('Error fetching stat definitions', {
          error: statDefError,
        });
        // Continue without stat modifiers if we can't fetch definitions
      } else {
        const validStatIds = new Set(
          statDefinitions?.map((def) => def.stat_id) || []
        );

        for (const statWrapper of statModifiersData) {
          const stat = statWrapper?.stat;

          if (stat && stat.stat_id && stat.value !== undefined) {
            const statId = parseInt(stat.stat_id);

            // Only include stat modifiers for stats that exist in our definitions
            if (validStatIds.has(statId)) {
              statModifiers.push({
                stat_id: statId,
                value: parseFloat(stat.value),
                display_name: `Stat ${statId}`,
              });
            } else {
              logger.debug('Skipping stat modifier for undefined stat_id', {
                statId,
                value: stat.value,
              });
            }
          }
        }
      }
    }

    logger.info('Successfully fetched league settings', {
      leagueKey,
      statModifiersCount: statModifiers.length,
    });

    return {
      league_key: leagueKey,
      stat_modifiers: statModifiers,
    };
  } catch (error) {
    logger.error('Error fetching league settings', { leagueKey, error });
    return null;
  }
}

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
        // Extract player data from the array structure
        const player: YahooRosterPlayer = {
          player_key: playerData[0]?.player_key || '',
          player_id: playerData[1]?.player_id || '',
          name: {
            full: playerData[2]?.name?.full || '',
            first: playerData[2]?.name?.first || '',
            last: playerData[2]?.name?.last || '',
            ascii_first: playerData[2]?.name?.ascii_first || '',
            ascii_last: playerData[2]?.name?.ascii_last || '',
          },
          editorial_player_key: playerData[6]?.editorial_player_key || '',
          editorial_team_key: playerData[7]?.editorial_team_key || '',
          editorial_team_full_name:
            playerData[8]?.editorial_team_full_name || '',
          editorial_team_abbr: playerData[9]?.editorial_team_abbr || '',
          bye_weeks: {
            week: playerData[10]?.bye_weeks?.week || '',
          },
          uniform_number: playerData[12]?.uniform_number || '',
          display_position: playerData[13]?.display_position || '',
          headshot: {
            url: playerData[14]?.headshot?.url || '',
            size: playerData[14]?.headshot?.size || '',
          },
          image_url: playerData[14]?.image_url || '',
          is_undroppable: playerData[15]?.is_undroppable || '',
          position_type: playerData[16]?.position_type || '',
          primary_position: playerData[17]?.primary_position || '',
          eligible_positions: {
            position: playerData[18]?.eligible_positions?.position || [],
          },
          has_player_notes: playerData[19]?.has_player_notes || '',
          player_notes_last_timestamp:
            playerData[20]?.player_notes_last_timestamp || '',
          selected_position: {
            coverage_type: selectedPositionData?.[0]?.coverage_type || '',
            position: selectedPositionData?.[1]?.position || '',
            is_flex: selectedPositionData?.[2]?.is_flex || '',
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
 * Fetch teams for a specific league from Yahoo Fantasy Sports API
 */
export async function fetchLeagueTeams(
  accessToken: string,
  leagueKey: string
): Promise<YahooTeam[]> {
  try {
    const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/teams?format=json`;

    logger.info('Fetching league teams from Yahoo API', { leagueKey });
    const response = await makeYahooApiCall(accessToken, url);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to fetch league teams', {
        leagueKey,
        status: response.status,
        error: errorText,
      });
      throw new Error(`Yahoo API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const teams = data?.fantasy_content?.league?.[1]?.teams;

    if (!teams) {
      logger.warn('No teams found in Yahoo API response', { leagueKey });
      return [];
    }

    const teamList: YahooTeam[] = [];

    // Process each team
    for (const teamKey in teams) {
      if (teamKey === 'count') continue;

      const team = teams[teamKey];
      const teamData = team?.team?.[0];

      if (teamData && Array.isArray(teamData)) {
        // Extract team data from the array structure
        // teamData[0] = { team_key: "..." }
        // teamData[1] = { team_id: "..." }
        // teamData[2] = { name: "..." }
        const teamKeyValue = teamData[0]?.team_key;
        const teamIdValue = teamData[1]?.team_id;
        const teamNameValue = teamData[2]?.name;

        if (teamKeyValue && teamIdValue && teamNameValue) {
          // Check if this team is owned by the current user
          const isOwnedByCurrentLogin =
            teamData[3]?.is_owned_by_current_login === 1;

          teamList.push({
            team_key: teamKeyValue,
            team_id: teamIdValue,
            name: teamNameValue,
            league_key: leagueKey,
            is_owned_by_current_login: isOwnedByCurrentLogin,
          });
        }
      }
    }

    logger.info('Successfully fetched league teams', {
      leagueKey,
      count: teamList.length,
    });
    return teamList;
  } catch (error) {
    logger.error('Error fetching league teams', { leagueKey, error });
    throw error;
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

    // First, clear existing roster entries for this team (since we're treating as snapshot)
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
            status: 'Active', // Default status for roster players
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

      // Create roster entry (upsert to handle player duplicates)
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
 * Sync league stat modifiers to the database
 */
export async function syncLeagueStatModifiers(
  leagueId: string,
  statModifiers: YahooStatModifier[]
): Promise<void> {
  try {
    logger.info('Syncing league stat modifiers', {
      leagueId,
      modifiersCount: statModifiers.length,
    });

    if (statModifiers.length > 0) {
      const modifiersToUpsert = statModifiers.map((modifier) => ({
        league_id: leagueId,
        stat_id: modifier.stat_id,
        value: modifier.value,
      }));

      const { error: upsertError } = await supabase
        .from('league_stat_modifiers')
        .upsert(modifiersToUpsert, {
          onConflict: 'league_id,stat_id',
        });

      if (upsertError) {
        logger.error('Error upserting stat modifiers', {
          leagueId,
          error: upsertError,
        });
        throw upsertError;
      }

      logger.info('Successfully synced stat modifiers', {
        leagueId,
        count: modifiersToUpsert.length,
      });
    } else {
      logger.info('No stat modifiers to sync for league', { leagueId });
    }
  } catch (error) {
    logger.error('Error syncing league stat modifiers', { leagueId, error });
    throw error;
  }
}

/**
 * Sync user's leagues to the database
 */
export async function syncUserLeagues(
  userId: string,
  accessToken: string
): Promise<{
  leagues: Record<string, unknown>[];
  teams: Record<string, unknown>[];
}> {
  try {
    logger.info('Starting league and team sync for user', { userId });

    // Fetch user's leagues
    const yahooLeagues = await fetchUserLeagues(accessToken);
    const syncedLeagues = [];
    const syncedTeams = [];

    for (const yahooLeague of yahooLeagues) {
      // Check if league already exists
      const { data: existingLeague, error: leagueSearchError } = await supabase
        .from('leagues')
        .select('id, yahoo_league_id')
        .eq('yahoo_league_id', yahooLeague.league_key)
        .single();

      if (leagueSearchError && leagueSearchError.code !== 'PGRST116') {
        logger.error('Error checking for existing league', {
          yahooLeagueId: yahooLeague.league_key,
          error: leagueSearchError,
        });
        continue;
      }

      let leagueId: string;

      if (existingLeague) {
        // League exists, update if needed
        logger.info('League already exists, updating if needed', {
          leagueId: existingLeague.id,
          yahooLeagueId: yahooLeague.league_key,
        });

        const { data: updatedLeague, error: updateError } = await supabase
          .from('leagues')
          .update({
            name: yahooLeague.name,
            season_year: parseInt(yahooLeague.season),
            scoring_type: yahooLeague.scoring_type,
            roster_positions: yahooLeague.roster_positions,
          })
          .eq('id', existingLeague.id)
          .select()
          .single();

        if (updateError) {
          logger.error('Error updating league', {
            leagueId: existingLeague.id,
            error: updateError,
          });
          continue;
        }

        leagueId = existingLeague.id;
        syncedLeagues.push(updatedLeague);
      } else {
        // Create new league
        logger.info('Creating new league', {
          yahooLeagueId: yahooLeague.league_id,
          name: yahooLeague.name,
        });

        const { data: newLeague, error: createError } = await supabase
          .from('leagues')
          .insert({
            yahoo_league_id: yahooLeague.league_key,
            name: yahooLeague.name,
            season_year: parseInt(yahooLeague.season),
            scoring_type: yahooLeague.scoring_type,
            roster_positions: yahooLeague.roster_positions,
          })
          .select()
          .single();

        if (createError) {
          logger.error('Error creating league', {
            yahooLeagueId: yahooLeague.league_key,
            error: createError,
          });
          continue;
        }

        leagueId = newLeague.id;
        syncedLeagues.push(newLeague);
      }

      // Fetch and sync league settings (including stat modifiers)
      try {
        const leagueSettings = await fetchLeagueSettings(
          accessToken,
          yahooLeague.league_key
        );

        if (leagueSettings && leagueSettings.stat_modifiers.length > 0) {
          await syncLeagueStatModifiers(
            leagueId,
            leagueSettings.stat_modifiers
          );
        }
      } catch (settingsError) {
        logger.error('Error syncing league settings', {
          leagueId,
          leagueKey: yahooLeague.league_key,
          error: settingsError,
        });
        // Continue with team sync even if settings sync fails
      }

      // Now fetch and sync teams for this league
      try {
        const yahooTeams = await fetchLeagueTeams(
          accessToken,
          yahooLeague.league_key
        );

        for (const yahooTeam of yahooTeams) {
          // Check if team already exists
          const { data: existingTeam, error: teamSearchError } = await supabase
            .from('teams')
            .select('id, yahoo_team_id')
            .eq('yahoo_team_id', yahooTeam.team_key)
            .eq('league_id', leagueId)
            .single();

          if (teamSearchError && teamSearchError.code !== 'PGRST116') {
            logger.error('Error checking for existing team', {
              yahooTeamId: yahooTeam.team_key,
              leagueId,
              error: teamSearchError,
            });
            continue;
          }

          let teamId: string;

          if (existingTeam) {
            // Team exists, update if needed
            logger.info('Team already exists, updating if needed', {
              teamId: existingTeam.id,
              yahooTeamId: yahooTeam.team_key,
              isOwnedByCurrentLogin: yahooTeam.is_owned_by_current_login,
            });

            // Only update user_id if the team is owned by current login
            const updateData: Record<string, unknown> = {
              name: yahooTeam.name,
            };

            if (yahooTeam.is_owned_by_current_login) {
              updateData.user_id = userId;
            }

            const { data: updatedTeam, error: updateError } = await supabase
              .from('teams')
              .update(updateData)
              .eq('id', existingTeam.id)
              .select()
              .single();

            if (updateError) {
              logger.error('Error updating team', {
                teamId: existingTeam.id,
                error: updateError,
              });
              continue;
            }

            teamId = existingTeam.id;
            syncedTeams.push(updatedTeam);
          } else {
            // Create new team
            logger.info('Creating new team', {
              yahooTeamId: yahooTeam.team_key,
              name: yahooTeam.name,
              leagueId,
              isOwnedByCurrentLogin: yahooTeam.is_owned_by_current_login,
            });

            const { data: newTeam, error: createError } = await supabase
              .from('teams')
              .insert({
                league_id: leagueId,
                yahoo_team_id: yahooTeam.team_key,
                user_id: yahooTeam.is_owned_by_current_login ? userId : null,
                name: yahooTeam.name,
              })
              .select()
              .single();

            if (createError) {
              logger.error('Error creating team', {
                yahooTeamId: yahooTeam.team_key,
                leagueId,
                error: createError,
              });
              continue;
            }

            teamId = newTeam.id;
            syncedTeams.push(newTeam);
          }

          // Fetch and sync roster for this team
          try {
            const roster = await fetchTeamRoster(
              accessToken,
              yahooTeam.team_key
            );
            if (roster) {
              await syncTeamRoster(teamId, roster);
            }
          } catch (rosterError) {
            logger.error('Error syncing roster for team', {
              teamId,
              teamKey: yahooTeam.team_key,
              error: rosterError,
            });
            // Continue with other teams even if roster sync fails
          }
        }
      } catch (teamError) {
        logger.error('Error syncing teams for league', {
          leagueId,
          leagueKey: yahooLeague.league_key,
          error: teamError,
        });
        // Continue with other leagues even if one fails
      }
    }

    logger.info('League and team sync completed', {
      userId,
      leaguesSynced: syncedLeagues.length,
      teamsSynced: syncedTeams.length,
    });

    return {
      leagues: syncedLeagues as Record<string, unknown>[],
      teams: syncedTeams as Record<string, unknown>[],
    };
  } catch (error) {
    logger.error('Error syncing user leagues and teams', { userId, error });
    throw error;
  }
}
