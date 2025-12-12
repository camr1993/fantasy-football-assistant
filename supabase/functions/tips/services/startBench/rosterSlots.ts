import { supabase } from '../../../utils/supabase.ts';
import { logger } from '../../../utils/logger.ts';

export interface LeagueRosterSlots {
  positions: Map<string, number>;
  flexSlots: number;
}

const FLEX_SLOT_PATTERNS = ['W/R/T', 'W/R', 'W/T', 'FLEX'];

/**
 * Check if a slot is a flex slot (W/R/T, W/R, FLEX, etc.)
 */
export function isFlexSlot(slot: string | null | undefined): boolean {
  if (!slot) return false;
  const slotUpper = slot.toUpperCase();
  return FLEX_SLOT_PATTERNS.some((pattern) => slotUpper.includes(pattern));
}

/**
 * Get all roster position slots for a league in a single query.
 * Returns both standard position counts and flex slot count.
 */
export async function getLeagueRosterSlots(
  leagueId: string
): Promise<LeagueRosterSlots> {
  const defaultSlots = getDefaultRosterSlots();

  try {
    const { data: rosterPositions, error } = await supabase
      .from('league_roster_positions')
      .select('position, count')
      .eq('league_id', leagueId);

    if (error) {
      logger.warn('Error fetching roster positions', {
        leagueId,
        error,
      });
      return defaultSlots;
    }

    if (!rosterPositions || rosterPositions.length === 0) {
      return defaultSlots;
    }

    const positions = new Map<string, number>();
    let flexSlots = 0;

    for (const rp of rosterPositions) {
      const posUpper = rp.position?.toUpperCase() || '';

      // Check if this is a flex position
      if (FLEX_SLOT_PATTERNS.some((fp) => posUpper.includes(fp))) {
        flexSlots += rp.count;
      } else {
        // Standard position
        positions.set(rp.position, rp.count);
      }
    }

    return { positions, flexSlots };
  } catch (error) {
    logger.error('Error in getLeagueRosterSlots', {
      leagueId,
      error,
    });
    return defaultSlots;
  }
}

/**
 * Get starting slots for a specific position from pre-fetched roster slots
 */
export function getStartingSlotsForPosition(
  rosterSlots: LeagueRosterSlots,
  position: string
): number {
  const count = rosterSlots.positions.get(position);
  if (count !== undefined) {
    return count;
  }
  // Fallback to default
  return getDefaultStartingSlots(position);
}

/**
 * Get default roster slots (fallback)
 */
function getDefaultRosterSlots(): LeagueRosterSlots {
  return {
    positions: new Map([
      ['QB', 1],
      ['RB', 2],
      ['WR', 2],
      ['TE', 1],
      ['K', 1],
      ['DEF', 1],
    ]),
    flexSlots: 1,
  };
}

/**
 * Get default starting slots per position (fallback)
 */
function getDefaultStartingSlots(position: string): number {
  const slots: Record<string, number> = {
    QB: 1,
    RB: 2,
    WR: 2,
    TE: 1,
    K: 1,
    DEF: 1,
  };
  return slots[position] || 0;
}
