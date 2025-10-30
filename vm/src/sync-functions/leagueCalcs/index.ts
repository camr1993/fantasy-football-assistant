/**
 * League Calculations Module
 *
 * Modular system for calculating fantasy football statistics and weighted scores
 *
 * Structure:
 * - types.ts: Type definitions
 * - constants.ts: Configuration constants and weights
 * - efficiencyMetrics.ts: Efficiency metrics calculations
 * - recentStats.ts: Recent statistics calculations
 * - normalization.ts: Min-max scaling normalization
 * - weightedScoring/: Position-specific weighted scoring
 *   - positionScoring.ts: Individual position scoring logic
 *   - leagueWeightedScoring.ts: League-wide weighted scoring
 * - leagueCalcsCoordinator.ts: Main orchestrator
 */

// Export main coordinator function
export { calculateRecentStatsOnly } from './leagueCalcsCoordinator.ts';

// Export individual modules for direct use if needed
export * from './efficiencyMetrics.ts';
export * from './recentStats.ts';
export * from './normalization.ts';
export * from './weightedScoring/positionScoring.ts';
export * from './weightedScoring/leagueWeightedScoring.ts';

// Export types and constants
export * from './types.ts';
export * from './constants.ts';
