import type { RecommendationConfidence } from './types.ts';

/**
 * Calculate confidence level based on percentage difference between scores
 */
export function calculateConfidence(
  playerScore: number,
  comparisonScore: number,
  recommendation: 'START' | 'BENCH'
): RecommendationConfidence {
  // For START: how much better is the benched player vs the current starter
  // For BENCH: how much better is the bench alternative vs the current starter
  const scoreDiff = Math.abs(playerScore - comparisonScore);
  const baseScore = Math.max(playerScore, comparisonScore, 1); // Avoid division by zero
  const percentDiff = (scoreDiff / baseScore) * 100;

  if (recommendation === 'START') {
    // Player should start - they're better than current starter
    if (percentDiff >= 25) {
      return { level: 3, label: 'Must Start' };
    } else if (percentDiff >= 10) {
      return { level: 2, label: 'Strong Start' };
    } else {
      return { level: 1, label: 'Lean Start' };
    }
  } else {
    // Player should be benched - someone else is better
    if (percentDiff >= 25) {
      return { level: 3, label: 'Must Bench' };
    } else if (percentDiff >= 10) {
      return { level: 2, label: 'Strong Bench' };
    } else {
      return { level: 1, label: 'Lean Bench' };
    }
  }
}

