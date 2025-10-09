import { ApiResponse } from '../types/api';
import { supabase } from '../supabaseClient';

class ApiClient {
  /**
   * Get user's fantasy leagues via edge function
   */
  async getLeagues(): Promise<ApiResponse<any>> {
    try {
      const yahooToken = await this.getYahooAccessToken();
      if (!yahooToken) {
        return {
          success: false,
          error: { error: 'No valid Yahoo access token' },
        };
      }

      const { data, error } = await supabase.functions.invoke('leagues', {
        headers: {
          'X-Yahoo-Token': yahooToken,
        },
      });

      if (error) {
        return {
          success: false,
          error: { error: error.message || 'API call failed' },
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
   * Get user's teams via edge function
   */
  async getTeams(): Promise<ApiResponse<any>> {
    try {
      const yahooToken = await this.getYahooAccessToken();
      if (!yahooToken) {
        return {
          success: false,
          error: { error: 'No valid Yahoo access token' },
        };
      }

      const { data, error } = await supabase.functions.invoke('teams', {
        headers: {
          'X-Yahoo-Token': yahooToken,
        },
      });

      if (error) {
        return {
          success: false,
          error: { error: error.message || 'API call failed' },
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
   * Get detailed league information including settings, teams, and standings
   */
  async getLeagueDetails(leagueKey: string): Promise<ApiResponse<any>> {
    try {
      const yahooToken = await this.getYahooAccessToken();
      if (!yahooToken) {
        return {
          success: false,
          error: { error: 'No valid Yahoo access token' },
        };
      }

      const { data, error } = await supabase.functions.invoke(
        'league-details',
        {
          headers: {
            'X-Yahoo-Token': yahooToken,
          },
          body: { league_key: leagueKey },
        }
      );

      if (error) {
        return {
          success: false,
          error: { error: error.message || 'API call failed' },
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
   * Get team roster with player details
   */
  async getRoster(teamKey: string): Promise<ApiResponse<any>> {
    try {
      const yahooToken = await this.getYahooAccessToken();
      if (!yahooToken) {
        return {
          success: false,
          error: { error: 'No valid Yahoo access token' },
        };
      }

      const { data, error } = await supabase.functions.invoke('roster', {
        headers: {
          'X-Yahoo-Token': yahooToken,
        },
        body: { team_key: teamKey },
      });

      if (error) {
        return {
          success: false,
          error: { error: error.message || 'API call failed' },
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
   * Get player stats and injury data
   */
  async getPlayerStats(
    leagueKey: string,
    options?: {
      playerKeys?: string;
      week?: string;
    }
  ): Promise<ApiResponse<any>> {
    try {
      const yahooToken = await this.getYahooAccessToken();
      if (!yahooToken) {
        return {
          success: false,
          error: { error: 'No valid Yahoo access token' },
        };
      }

      const { data, error } = await supabase.functions.invoke('player-stats', {
        headers: {
          'X-Yahoo-Token': yahooToken,
        },
        body: {
          league_key: leagueKey,
          ...options,
        },
      });

      if (error) {
        return {
          success: false,
          error: { error: error.message || 'API call failed' },
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
   * Get waiver wire and free agents
   */
  async getWaiverWire(
    leagueKey: string,
    options?: {
      position?: string;
      status?: string;
      count?: string;
    }
  ): Promise<ApiResponse<any>> {
    try {
      const yahooToken = await this.getYahooAccessToken();
      if (!yahooToken) {
        return {
          success: false,
          error: { error: 'No valid Yahoo access token' },
        };
      }

      const { data, error } = await supabase.functions.invoke('waiver-wire', {
        headers: {
          'X-Yahoo-Token': yahooToken,
        },
        body: {
          league_key: leagueKey,
          ...options,
        },
      });

      if (error) {
        return {
          success: false,
          error: { error: error.message || 'API call failed' },
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
   * Get transactions and trade data
   */
  async getTransactions(
    leagueKey: string,
    options?: {
      type?: string;
      teamKey?: string;
      count?: string;
    }
  ): Promise<ApiResponse<any>> {
    try {
      const yahooToken = await this.getYahooAccessToken();
      if (!yahooToken) {
        return {
          success: false,
          error: { error: 'No valid Yahoo access token' },
        };
      }

      const { data, error } = await supabase.functions.invoke('transactions', {
        headers: {
          'X-Yahoo-Token': yahooToken,
        },
        body: {
          league_key: leagueKey,
          ...options,
        },
      });

      if (error) {
        return {
          success: false,
          error: { error: error.message || 'API call failed' },
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
   * Get matchups and weekly performance
   */
  async getMatchups(
    leagueKey: string,
    options?: {
      week?: string;
      teamKey?: string;
    }
  ): Promise<ApiResponse<any>> {
    try {
      const yahooToken = await this.getYahooAccessToken();
      if (!yahooToken) {
        return {
          success: false,
          error: { error: 'No valid Yahoo access token' },
        };
      }

      const { data, error } = await supabase.functions.invoke('matchups', {
        headers: {
          'X-Yahoo-Token': yahooToken,
        },
        body: {
          league_key: leagueKey,
          ...options,
        },
      });

      if (error) {
        return {
          success: false,
          error: { error: error.message || 'API call failed' },
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
   * Sync league data (leagues, teams, rosters) via edge function
   */
  async syncLeagueData(): Promise<ApiResponse<any>> {
    try {
      const yahooToken = await this.getYahooAccessToken();
      if (!yahooToken) {
        return {
          success: false,
          error: { error: 'No valid Yahoo access token' },
        };
      }

      // Get user ID from Chrome storage
      const result = await chrome.storage.local.get(['yahoo_user']);
      const user = result.yahoo_user;

      if (!user || !user.id) {
        return {
          success: false,
          error: { error: 'No user found' },
        };
      }

      const { data, error } = await supabase.functions.invoke(
        'sync-league-data',
        {
          body: {
            userId: user.id,
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
    syncType: 'manual' | 'periodic' | 'test' | 'post-triggered' = 'manual'
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

      // Get user data from storage
      const result = await chrome.storage.local.get(['yahoo_user']);
      const user = result.yahoo_user;
      const accessToken = user?.yahoo_access_token;

      if (!user || !accessToken) {
        console.log('No user or access token found, skipping roster sync');
        return {
          success: false,
          error: { error: 'No user or access token found' },
        };
      }

      console.log(`Starting ${syncType} roster sync...`);

      // Call the sync-league-data function with roster-only sync
      const { data, error } = await supabase.functions.invoke(
        'sync-league-data',
        {
          body: {
            userId: user.id,
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
      if (syncType === 'periodic' || syncType === 'test') {
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
      const minIntervalMs = 25 * 60 * 1000; // 25 minutes in milliseconds

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
   * Get Yahoo access token from Chrome storage
   */
  private async getYahooAccessToken(): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get(['yahoo_user']);
      const user = result.yahoo_user;

      if (!user || !user.yahoo_access_token) {
        console.error('No Yahoo access token found');
        return null;
      }

      return user.yahoo_access_token;
    } catch (error) {
      console.error('Error getting Yahoo access token:', error);
      return null;
    }
  }
}

export const apiClient = new ApiClient();
