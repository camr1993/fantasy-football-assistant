import { apiClient } from '../../api/client';
import type { TipsResponse, PlayerRecommendationsMap } from '../../types/tips';

/**
 * Fetch tips from the API and store in chrome.storage
 */
export async function fetchAndStoreTips(): Promise<void> {
  try {
    const result = await apiClient.getTips();

    if (result.success && result.data) {
      const tips = result.data as TipsResponse;

      // Build a map of player recommendations indexed by Yahoo player ID
      const playerRecommendations = buildPlayerRecommendationsMap(tips);

      // Store both raw tips and the processed map
      await chrome.storage.local.set({
        tips_data: tips,
        player_recommendations: playerRecommendations,
        user_teams: tips.user_teams || [],
        tips_timestamp: Date.now(),
      });

      console.log('Tips data stored successfully', {
        startBenchCount: tips.start_bench_recommendations?.length || 0,
        waiverRecommendationsCount:
          tips.waiver_wire_recommendations?.length || 0,
        playerMapSize: Object.keys(playerRecommendations).length,
        userTeamsCount: tips.user_teams?.length || 0,
      });
    } else {
      console.error('Failed to fetch tips:', result.error);
    }
  } catch (error) {
    console.error('Error fetching tips:', error);
  }
}

/**
 * Build a map of player recommendations indexed by Yahoo player ID (numeric part only)
 * Yahoo player IDs are stored as "461.p.40042" but the DOM uses just "40042"
 */
function buildPlayerRecommendationsMap(
  tips: TipsResponse
): PlayerRecommendationsMap {
  const map: PlayerRecommendationsMap = {};

  // Index start/bench recommendations by yahoo_player_id
  if (tips.start_bench_recommendations) {
    for (const rec of tips.start_bench_recommendations) {
      const yahooId = rec.yahoo_player_id;
      if (!yahooId) continue;

      if (!map[yahooId]) {
        map[yahooId] = {};
      }
      map[yahooId].startBench = rec;
    }
  }

  // Index waiver recommendations by the rostered player's yahoo_player_id
  // (since we want to show "upgrade available" on the rostered player)
  if (tips.waiver_wire_recommendations) {
    for (const rec of tips.waiver_wire_recommendations) {
      const yahooId = rec.rostered_yahoo_player_id;
      if (!yahooId) continue;

      if (!map[yahooId]) {
        map[yahooId] = {};
      }
      if (!map[yahooId].waiverUpgrades) {
        map[yahooId].waiverUpgrades = [];
      }
      map[yahooId].waiverUpgrades!.push(rec);
    }
  }

  return map;
}

/**
 * Notify the content script that tips have been updated
 */
export function notifyContentScriptTipsUpdated(tabId: number): void {
  chrome.tabs.sendMessage(tabId, { type: 'TIPS_UPDATED' }).catch(() => {
    // Content script might not be ready, that's okay
    console.log('Could not notify content script of tips update');
  });
}

