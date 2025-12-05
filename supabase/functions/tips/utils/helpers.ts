import { supabase } from '../../utils/supabase.ts';
import { logger } from '../../utils/logger.ts';

/**
 * Get starting slots per position for a specific league
 */
export async function getStartingSlotsForPosition(
  leagueId: string,
  position: string
): Promise<number> {
  try {
    // Query league roster positions
    const { data: rosterPosition, error } = await supabase
      .from('league_roster_positions')
      .select('count')
      .eq('league_id', leagueId)
      .eq('position', position)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.warn('Error fetching roster position', {
        leagueId,
        position,
        error,
      });
      // Fallback to default if error
      return getDefaultStartingSlots(position);
    }

    if (rosterPosition) {
      return rosterPosition.count;
    }

    // If position not found, try to match FLEX positions
    // Check for FLEX positions (W/R/T, W/R, etc.)
    if (['RB', 'WR', 'TE'].includes(position)) {
      const { data: flexPositions } = await supabase
        .from('league_roster_positions')
        .select('position, count')
        .eq('league_id', leagueId)
        .or('position.ilike.%FLEX%,position.ilike.%W/R%');

      if (flexPositions && flexPositions.length > 0) {
        // Sum up all FLEX positions
        const flexCount = flexPositions.reduce(
          (sum, pos) => sum + pos.count,
          0
        );
        if (flexCount > 0) {
          return flexCount;
        }
      }
    }

    // Fallback to default
    return getDefaultStartingSlots(position);
  } catch (error) {
    logger.error('Error in getStartingSlotsForPosition', {
      leagueId,
      position,
      error,
    });
    return getDefaultStartingSlots(position);
  }
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
    'W/R/T': 1,
  };
  return slots[position] || 0;
}
