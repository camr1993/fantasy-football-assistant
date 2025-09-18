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
