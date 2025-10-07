import { logger } from './logger.ts';
import { makeYahooApiCall } from './yahooApi.ts';
import { supabase } from './supabase.ts';

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

            syncedTeams.push(newTeam);
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
