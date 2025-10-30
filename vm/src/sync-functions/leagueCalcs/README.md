# League Calculations Module

A modular system for calculating fantasy football statistics and weighted scores.

## Structure

```
leagueCalcs/
├── index.ts                    # Main entry point - exports all modules
├── types.ts                    # Type definitions
├── constants.ts                # Configuration constants and position weights
├── efficiencyMetrics.ts        # Efficiency metrics calculations
├── recentStats.ts             # Recent statistics calculations
├── normalization.ts           # Min-max scaling normalization
├── leagueCalcsCoordinator.ts  # Main orchestrator
└── weightedScoring/
    ├── positionScoring.ts     # Individual position scoring logic
    └── leagueWeightedScoring.ts # League-wide weighted scoring
```

## Modules

### Core Calculation Modules

- **`efficiencyMetrics.ts`**: Calculates targets per game, catch rate, yards per target, and their 3-week rolling averages
- **`recentStats.ts`**: Calculates rolling mean and standard deviation of fantasy points over recent weeks
- **`normalization.ts`**: Applies min-max scaling (0-1 normalization) to efficiency metrics

### Weighted Scoring System

- **`positionScoring.ts`**: Position-specific weighted scoring logic
  - Currently implements WR scoring
  - Extensible for other positions (RB, QB, TE, K)
- **`leagueWeightedScoring.ts`**: Orchestrates weighted scoring for all players in a league

### Configuration

- **`constants.ts`**: Contains all configuration constants and position-specific weights
- **`types.ts`**: TypeScript type definitions for all interfaces

### Main Coordinator

- **`leagueCalcsCoordinator.ts`**: Main orchestrator that coordinates all calculations
- **`index.ts`**: Exports all modules for easy importing

## Usage

### Basic Usage (Backward Compatible)

```typescript
import { calculateRecentStatsOnly } from './leagueCalcs.ts';

// Calculate for specific league
await calculateRecentStatsOnly('league-id', 2024, 5);

// Calculate for all leagues
await calculateRecentStatsOnly();
```

### Advanced Usage (Modular)

```typescript
import {
  calculateEfficiencyMetrics,
  calculateRecentStats,
  calculateWeightedScore,
  POSITION_WEIGHTS
} from './leagueCalcs/index.ts';

// Calculate individual metrics
const efficiency = await calculateEfficiencyMetrics(leagueId, playerId, season, week);
const recent = await calculateRecentStats(leagueId, playerId, season, week);
const weighted = await calculateWeightedScore('WR', leagueId, playerId, season, week);
```

## Adding New Positions

To add weighted scoring for a new position (e.g., RB):

1. **Add weights to `constants.ts`**:
```typescript
export const RB_WEIGHTS = {
  recent_mean: 0.40,
  volatility: -0.15,
  // ... other weights
} as const;

export const POSITION_WEIGHTS = {
  WR: WR_WEIGHTS,
  RB: RB_WEIGHTS, // Add new position
  // ...
} as const;
```

2. **Implement scoring function in `positionScoring.ts`**:
```typescript
export async function calculateWeightedScoreRB(
  leagueId: string,
  playerId: string,
  seasonYear: number,
  week: number
): Promise<WeightedScoreResult> {
  // Implementation for RB-specific scoring
}
```

3. **Update the generic `calculateWeightedScore` function**:
```typescript
export async function calculateWeightedScore(
  position: keyof typeof POSITION_WEIGHTS,
  // ... other params
): Promise<WeightedScoreResult> {
  if (position === 'WR') {
    return calculateWeightedScoreWR(leagueId, playerId, seasonYear, week);
  }
  if (position === 'RB') {
    return calculateWeightedScoreRB(leagueId, playerId, seasonYear, week);
  }
  // ...
}
```

4. **Update `leagueWeightedScoring.ts`** to include the new position in league-wide calculations.

## Benefits of Modular Structure

- **Maintainability**: Each module has a single responsibility
- **Extensibility**: Easy to add new positions or modify existing logic
- **Testability**: Individual modules can be tested in isolation
- **Reusability**: Modules can be imported and used independently
- **Readability**: Clear separation of concerns makes code easier to understand
