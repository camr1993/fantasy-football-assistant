import { supabase } from '../supabaseClient';
import { TestUsersResponse, ApiResponse } from '../types/api';
import { tokenManager } from '../utils/tokenManager';

class ApiClient {
  async getTestUsers(): Promise<ApiResponse<TestUsersResponse>> {
    try {
      const { data, error } =
        await supabase.functions.invoke('test-fetch-data');

      if (error) {
        return {
          success: false,
          error: { error: error.message || 'Unknown error' },
        };
      }

      return {
        success: true,
        data: data as TestUsersResponse,
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
   * Make a Yahoo API call with automatic token refresh
   */
  async makeYahooApiCall(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const accessToken = await tokenManager.getValidAccessToken();

    if (!accessToken) {
      throw new Error('No valid access token available');
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    return fetch(url, {
      ...options,
      headers,
    });
  }

  /**
   * Get user's fantasy leagues via edge function
   */
  async getLeagues(): Promise<ApiResponse<any>> {
    try {
      const { data, error } = await supabase.functions.invoke('leagues', {
        headers: {
          'x-user-id': await this.getCurrentUserId(),
        },
      });

      if (error) {
        return {
          success: false,
          error: { error: error.message || 'Unknown error' },
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
      const { data, error } = await supabase.functions.invoke('teams', {
        headers: {
          'x-user-id': await this.getCurrentUserId(),
        },
      });

      if (error) {
        return {
          success: false,
          error: { error: error.message || 'Unknown error' },
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
   * Get current user ID from Chrome storage
   */
  private async getCurrentUserId(): Promise<string> {
    try {
      const result = await chrome.storage.local.get(['yahoo_user']);
      const user = result.yahoo_user;

      if (!user || !user.id) {
        throw new Error('No authenticated user found');
      }

      return user.id;
    } catch (error) {
      throw new Error('No authenticated user found');
    }
  }
}

export const apiClient = new ApiClient();
