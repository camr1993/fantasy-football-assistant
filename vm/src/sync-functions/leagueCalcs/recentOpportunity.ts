import { supabase } from '../../../../supabase/functions/utils/supabase.ts';
import { logger } from '../../../../supabase/functions/utils/logger.ts';

/** Weeks of opportunity counted, matching the recent-stats window */
const RECENT_WEEKS = 3;

/**
 * Minimum opportunity, summed over the recent window, before a player is
 * credited for avoiding bad outcomes.
 *
 * Drawn from the distribution of players actually in starting slots, which is
 * sharply bimodal - real starters sit well above these numbers and
 * non-participants well below, so the thresholds fall in the gap rather than
 * on a slope:
 *
 *   QB starters   0-5: 2    5-20: 0    20-30: 1   30+: 27
 *   RB starters   0-10: 0   10-15: 1   15-25: 8   25+: 34
 *   WR starters   0-2: 1    2-6: 1     6-9: 7     9+: 48
 *
 * DEF is absent deliberately: a defense plays every week, so there is no such
 * thing as a defense without opportunity.
 */
export const MIN_RECENT_OPPORTUNITY: Record<string, number> = {
  QB: 15, // pass attempts
  RB: 10, // rushing attempts + targets
  WR: 4, // targets
  TE: 4, // targets
  K: 2, // field goal attempts
};

/**
 * Opportunity each player had over the recent window, by position.
 *
 * Several scoring factors carry a negative weight - turnovers, kicking misses,
 * volatility - so a player is rewarded for *not* doing something bad. That is
 * only meaningful in proportion to how often they could have done it. A
 * quarterback who attempts nine passes in three weeks throws no interceptions
 * and scores better on turnover avoidance than any real starter, which was
 * enough to rank a short-yardage specialist above a full-time starter.
 */
export async function fetchRecentOpportunity(
  seasonYear: number,
  week: number,
  playerIds: string[]
): Promise<Map<string, number>> {
  const opportunity = new Map<string, number>();
  if (playerIds.length === 0) return opportunity;

  const startWeek = Math.max(1, week - recentWindowWeeks(week) + 1);

  const { data, error } = await supabase
    .from('player_stats')
    .select(
      `player_id, passes_attempted, rushing_attempts, targets, fg_attempts,
       players!player_stats_player_id_fkey(position)`
    )
    .in('player_id', playerIds)
    .eq('season_year', seasonYear)
    .eq('source', 'actual')
    .gte('week', startWeek)
    .lte('week', week);

  if (error) {
    logger.warn('Failed to fetch recent opportunity; skipping the adjustment', {
      seasonYear,
      week,
      error: error.message,
    });
    return opportunity;
  }

  for (const row of (data || []) as Array<{
    player_id: string;
    passes_attempted: number | null;
    rushing_attempts: number | null;
    targets: number | null;
    fg_attempts: number | null;
    players: { position: string } | { position: string }[] | null;
  }>) {
    const player = Array.isArray(row.players) ? row.players[0] : row.players;
    const position = player?.position;
    if (!position) continue;

    let amount = 0;
    if (position === 'QB') amount = row.passes_attempted || 0;
    else if (position === 'RB')
      amount = (row.rushing_attempts || 0) + (row.targets || 0);
    else if (position === 'WR' || position === 'TE') amount = row.targets || 0;
    else if (position === 'K') amount = row.fg_attempts || 0;
    else continue;

    opportunity.set(
      row.player_id,
      (opportunity.get(row.player_id) || 0) + amount
    );
  }

  return opportunity;
}

/** How many weeks of the season the recent window actually covers */
export function recentWindowWeeks(week: number): number {
  return Math.min(RECENT_WEEKS, Math.max(1, week));
}

/**
 * The opportunity threshold for a position, prorated to the window.
 *
 * The thresholds are three-week totals, but the window is shorter at the
 * start of a season - one week in week 1. Applying the full figure then would
 * make the bar three times as strict per game, for no reason. Kickers show
 * this most clearly: one field goal attempt in a game is ordinary, so a flat
 * gate of 2 would neutralise much of the position in week 1.
 */
export function opportunityThreshold(
  position: string,
  week: number
): number | undefined {
  const full = MIN_RECENT_OPPORTUNITY[position];
  if (full === undefined) return undefined;

  return (full * recentWindowWeeks(week)) / RECENT_WEEKS;
}

/**
 * Whether a player saw enough of the field for "avoided a bad outcome" to
 * count as a genuine strength rather than an artefact of not playing.
 */
export function hasEnoughOpportunity(
  position: string,
  opportunity: Map<string, number>,
  playerId: string,
  week: number
): boolean {
  const threshold = opportunityThreshold(position, week);
  if (threshold === undefined) return true; // positions with no volume concept
  return (opportunity.get(playerId) || 0) >= threshold;
}
