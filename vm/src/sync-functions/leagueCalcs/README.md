# League Calculations Module

A modular system for calculating fantasy football statistics and weighted scores.

## Structure

```
leagueCalcs/
├── index.ts                    # Main entry point - exports all modules
├── types.ts                    # Type definitions
├── constants.ts                # Configuration constants and position weights
├── recentStats.ts             # Recent statistics calculations
├── normalization.ts           # Min-max scaling normalization
└── weightedScoring/
    ├── index.ts               # Re-exports all position scoring functions
    └── positions/
        ├── wr.ts              # WR weighted scoring
        └── rb.ts              # RB weighted scoring
```

## Modules

### Core Calculation Modules

- **`efficiencyMetrics.ts`**: Calculates targets per game, catch rate, yards per target, and their 3-week rolling averages
- **`recentStats.ts`**: Calculates rolling mean and standard deviation of fantasy points over recent weeks
- **`normalization.ts`**: Applies min-max scaling (0-1 normalization) to efficiency metrics

### Weighted Scoring System

- **`weightedScoring/`**: Position-specific weighted scoring logic
  - **`positions/wr.ts`**: WR weighted scoring implementation
  - **`positions/rb.ts`**: RB weighted scoring implementation
  - **`index.ts`**: Re-exports all position scoring functions
  - Extensible for other positions (QB, TE, K) - just add a new file in `positions/`

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
  calculateRecentStats,
  calculateWeightedScore,
  POSITION_WEIGHTS,
} from './leagueCalcs/index.ts';

// Calculate individual metrics
const recent = await calculateRecentStats(leagueId, playerId, season, week);
const weighted = await calculateWeightedScore(
  'WR',
  leagueId,
  playerId,
  season,
  week
);
```

## Adding New Positions

To add weighted scoring for a new position (e.g., RB):

1. **Add weights to `constants.ts`**:

```typescript
export const RB_WEIGHTS = {
  recent_mean: 0.4,
  volatility: -0.15,
  // ... other weights
} as const;

export const POSITION_WEIGHTS = {
  WR: WR_WEIGHTS,
  RB: RB_WEIGHTS, // Add new position
  // ...
} as const;
```

2. **Create a new position file in `weightedScoring/positions/`** (e.g., `qb.ts`):

```typescript
export async function calculateWeightedScoresForLeagueQB(
  leagueId: string,
  seasonYear: number,
  week: number
): Promise<void> {
  // Implementation for QB-specific scoring
}
```

3. **Export the function in `weightedScoring/index.ts`**:

```typescript
export { calculateWeightedScoresForLeagueQB } from './positions/qb.ts';
```

4. **Call the function in `leagueCalcs/index.ts`** after normalization.

## Benefits of Modular Structure

- **Maintainability**: Each module has a single responsibility
- **Extensibility**: Easy to add new positions or modify existing logic
- **Testability**: Individual modules can be tested in isolation
- **Reusability**: Modules can be imported and used independently
- **Readability**: Clear separation of concerns makes code easier to understand
