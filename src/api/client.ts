import { supabase } from '../supabaseClient';
import { TestUsersResponse, ApiResponse } from '../types/api';

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
}

export const apiClient = new ApiClient();
