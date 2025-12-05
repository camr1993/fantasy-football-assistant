import { ApiResponse } from '../types/api';
import { supabase } from '../supabaseClient';

class ApiClient {
  /**
   * Sync league data (leagues, teams, rosters) via edge function
   */
  async syncLeagueData(): Promise<ApiResponse<any>> {
    try {
      const userId = await this.getUserId();
      if (!userId) {
        return {
          success: false,
          error: { error: 'No user found' },
        };
      }

      const { data, error } = await supabase.functions.invoke(
        'sync-league-data',
        {
          body: {
            userId,
            syncType: 'full',
          },
        }
      );

      if (error) {
        return {
          success: false,
          error: { error: error.message || 'League data sync failed' },
        };
      }

      return {
        success: true,
        data: data,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Trigger roster sync for all user teams
   */
  async triggerRosterSync(
    syncType: 'manual' | 'periodic' | 'post-triggered' = 'manual'
  ): Promise<ApiResponse<any>> {
    try {
      // Check if this is a periodic sync and if we've synced too recent
      if (syncType === 'periodic') {
        const shouldSync = await this.shouldPerformPeriodicSync();
        if (!shouldSync) {
          console.log('Skipping periodic sync - too recent');
          return {
            success: false,
            error: { error: 'Periodic sync too recent' },
          };
        }
      }

      const userId = await this.getUserId();
      if (!userId) {
        console.log('No user found, skipping roster sync');
        return {
          success: false,
          error: { error: 'No user found' },
        };
      }

      console.log(`Starting ${syncType} roster sync...`);

      // Call the sync-league-data function with roster-only sync
      const { data, error } = await supabase.functions.invoke(
        'sync-league-data',
        {
          body: {
            userId,
            syncType: 'roster',
          },
        }
      );

      if (error) {
        console.error(`${syncType} roster sync failed:`, error.message);
        return {
          success: false,
          error: { error: error.message || 'Roster sync failed' },
        };
      }

      console.log(`${syncType} roster sync completed successfully`);
      console.log(data);

      // Store the last sync time for periodic syncs
      if (syncType === 'periodic') {
        await chrome.storage.local.set({
          lastPeriodicSync: Date.now(),
        });
        console.log('Last periodic sync time updated');
      }

      return {
        success: true,
        data: data,
      };
    } catch (error) {
      console.error(`Error triggering ${syncType} roster sync:`, error);
      return {
        success: false,
        error: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Check if we should perform a periodic sync based on timing
   */
  async shouldPerformPeriodicSync(): Promise<boolean> {
    try {
      const result = await chrome.storage.local.get(['lastPeriodicSync']);
      const lastSync = result.lastPeriodicSync;

      if (!lastSync) {
        console.log('No previous periodic sync found, allowing sync');
        return true;
      }

      const now = Date.now();
      const timeSinceLastSync = now - lastSync;
      const minIntervalMs = 110 * 60 * 1000; // 110 minutes in milliseconds

      if (timeSinceLastSync < minIntervalMs) {
        const remainingMinutes = Math.ceil(
          (minIntervalMs - timeSinceLastSync) / (60 * 1000)
        );
        console.log(
          `Periodic sync too recent. Last sync was ${Math.round(timeSinceLastSync / (60 * 1000))} minutes ago. Next sync in ${remainingMinutes} minutes.`
        );
        return false;
      }

      console.log(
        `Periodic sync allowed. Last sync was ${Math.round(timeSinceLastSync / (60 * 1000))} minutes ago.`
      );
      return true;
    } catch (error) {
      console.error('Error checking periodic sync interval:', error);
      return true; // Allow sync on error to avoid blocking
    }
  }

  /**
   * Get fantasy tips (waiver wire recommendations and start/bench advice)
   */
  async getTips(): Promise<ApiResponse<any>> {
    try {
      const userId = await this.getUserId();
      if (!userId) {
        return {
          success: false,
          error: { error: 'No user found' },
        };
      }

      const { data, error } = await supabase.functions.invoke('tips', {
        body: {
          userId,
        },
      });

      if (error) {
        return {
          success: false,
          error: { error: error.message || 'Failed to get tips' },
        };
      }

      return {
        success: true,
        data: data,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Get user ID from Chrome storage
   */
  private async getUserId(): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get(['yahoo_user']);
      const user = result.yahoo_user;

      if (!user || !user.id) {
        console.error('No user found');
        return null;
      }

      return user.id;
    } catch (error) {
      console.error('Error getting user ID:', error);
      return null;
    }
  }
}

export const apiClient = new ApiClient();
