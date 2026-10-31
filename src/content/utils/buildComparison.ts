import type { PlayerRecommendations } from '../../types/tips';

export type EntrySource = 'current' | 'bench' | 'starting' | 'free_agent';

export interface ComparisonEntry {
  name: string;
  team?: string;
  score: number;
  source: EntrySource;
  /** Difference from the current player's score; undefined for the player */
  gap?: number;
  action?: 'START' | 'ADD';
  injuryStatus?: string;
}

export interface ComparisonView {
  /** The player whose icon was clicked */
  playerName: string;
  position?: string;
  leagueName?: string;
  teamName?: string;
  /** Every option, best score first, including the current player */
  entries: ComparisonEntry[];
  /** Index of the current player within entries */
  currentIndex: number;
  /** Why the top option beats the current player, best first */
  factors: string[];
  /** The single recommended move, or null when the player is already best */
  headline: string | null;
  /** True when the best alternative is only marginally better */
  isMarginal: boolean;
}

const BENCH_SLOTS = ['BN', 'BENCH', 'IR'];

/**
 * Below this score gap an "upgrade" is not meaningfully better. Real
 * recommendations routinely clear it by an order of magnitude, so treating
 * these as equivalent avoids presenting a coin flip as a clear win.
 */
export const MARGINAL_GAP = 0.15;

function sourceForSlot(slot?: string): EntrySource {
  if (!slot) return 'bench';
  return BENCH_SLOTS.includes(slot.toUpperCase()) ? 'bench' : 'starting';
}

/**
 * Flatten start/bench and waiver recommendations into one ranked comparison.
 *
 * The two kinds of recommendation answer the same question - "is there a
 * better option at this spot?" - so presenting them as separate lists left
 * the user to merge them mentally. Ranking every option against the current
 * player turns it into one decision.
 */
export function buildComparisonView(
  recommendations: PlayerRecommendations,
  playerName: string
): ComparisonView {
  const { startBench, waiverUpgrades } = recommendations;
  const firstWaiver = waiverUpgrades?.[0];

  const currentScore =
    startBench?.weighted_score ?? firstWaiver?.rostered_weighted_score ?? 0;
  const currentTeam = startBench?.team ?? firstWaiver?.rostered_player_team;
  const currentSlot = startBench?.slot;

  const entries: ComparisonEntry[] = [
    {
      name: startBench?.name ?? firstWaiver?.rostered_player_name ?? playerName,
      team: currentTeam,
      score: currentScore,
      source: 'current',
      injuryStatus:
        startBench?.injury_status ?? firstWaiver?.rostered_injury_status,
    },
  ];

  // The roster alternative, when there is one. A placeholder comparison (used
  // when no real replacement exists) carries a sentinel score of 0 or 100.
  if (
    startBench &&
    startBench.comparison_name &&
    startBench.comparison_score !== 100 &&
    startBench.comparison_score !== 0
  ) {
    entries.push({
      name: startBench.comparison_name,
      team: startBench.comparison_team,
      score: startBench.comparison_score,
      source: sourceForSlot(startBench.comparison_slot),
      action:
        sourceForSlot(startBench.comparison_slot) === 'bench'
          ? 'START'
          : undefined,
    });
  }

  for (const upgrade of waiverUpgrades ?? []) {
    entries.push({
      name: upgrade.waiver_player_name,
      team: upgrade.waiver_player_team,
      score: upgrade.waiver_weighted_score,
      source: 'free_agent',
      action: 'ADD',
      injuryStatus: upgrade.waiver_injury_status,
    });
  }

  entries.sort((a, b) => b.score - a.score);
  for (const entry of entries) {
    if (entry.source !== 'current') entry.gap = entry.score - currentScore;
  }

  const currentIndex = entries.findIndex((e) => e.source === 'current');
  const best = entries[0];
  const isBestAlready = best.source === 'current';
  const bestGap = isBestAlready ? 0 : (best.gap ?? 0);
  const isMarginal = !isBestAlready && bestGap < MARGINAL_GAP;

  // Prefer the factors describing whichever option actually tops the list
  const factors =
    (best.source === 'free_agent'
      ? waiverUpgrades?.find((u) => u.waiver_player_name === best.name)?.factors
      : startBench?.factors) ?? [];

  return {
    playerName,
    position: startBench?.position,
    leagueName: startBench?.league_name ?? firstWaiver?.league_name,
    teamName: startBench?.team_name ?? firstWaiver?.team_name,
    entries,
    currentIndex,
    factors,
    headline: buildHeadline(entries[0], entries[currentIndex], isMarginal),
    isMarginal,
  };
}

function buildHeadline(
  best: ComparisonEntry,
  current: ComparisonEntry,
  isMarginal: boolean
): string | null {
  if (best.source === 'current') return null;

  if (isMarginal) {
    return `${best.name} is a slight edge over ${current.name}`;
  }

  return best.source === 'free_agent'
    ? `Replace ${current.name} with ${best.name}`
    : `Start ${best.name} over ${current.name}`;
}
