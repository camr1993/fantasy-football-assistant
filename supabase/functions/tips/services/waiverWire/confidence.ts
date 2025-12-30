import type { RecommendationConfidence } from './types.ts';

/**
 * Calculate confidence level for waiver wire recommendations
 */
export function calculateWaiverConfidence(
  waiverScore: number,
  rosteredScore: number
): RecommendationConfidence {
  // Calculate percentage improvement
  const improvement =
    rosteredScore > 0
      ? ((waiverScore - rosteredScore) / rosteredScore) * 100
      : waiverScore > 0
        ? 100
        : 0;

  if (improvement >= 25) {
    return { level: 3, label: 'Strong Upgrade' };
  } else if (improvement >= 10) {
    return { level: 2, label: 'Good Upgrade' };
  } else {
    return { level: 1, label: 'Slight Upgrade' };
  }
}

