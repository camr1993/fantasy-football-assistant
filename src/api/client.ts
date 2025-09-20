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
