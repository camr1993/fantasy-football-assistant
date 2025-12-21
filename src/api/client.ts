import { ApiResponse } from '../types/api';
import {
  supabase,
  setSupabaseSession,
  getSupabaseSession,
} from '../supabaseClient';

interface OAuthCallbackResponse {
  success: boolean;
  isFirstTimeUser?: boolean;
  user?: {
    id: string;
    name?: string;
    email?: string;
  };
  session?: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    expires_in: number;
  };
  error?: string;
}

interface OAuthInitResponse {
  auth_url: string;
  nonce: string;
}

class ApiClient {
  /**
   * Initiate OAuth flow and get the auth URL
   */
  async initiateOAuth(): Promise<ApiResponse<OAuthInitResponse>> {
    try {
      const { data, error } = await supabase.functions.invoke('oauth/auth');

      if (error) {
        return {
          success: false,
          error: { error: error.message || 'Failed to initiate OAuth' },
        };
      }

      if (data?.auth_url && data?.nonce) {
        return {
          success: true,
          data: data,
        };
      } else {
        return {
          success: false,
          error: { error: 'Failed to get OAuth URL or nonce' },
        };
      }
    } catch (error) {
      console.error('OAuth initiation error:', error);
      return {
        success: false,
        error: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Exchange OAuth authorization code for tokens
   */
  async exchangeOAuthCode(
    code: string,
    nonce: string
  ): Promise<ApiResponse<OAuthCallbackResponse>> {
    try {
      const { data, error } = await supabase.functions.invoke(
        'oauth/callback',
        {
          body: {
            code,
            state: 'fantasy-football-assistant',
            nonce,
          },
        }
      );

      if (error) {
        return {
          success: false,
          error: { error: error.message || 'Token exchange failed' },
        };
      }

      if (data?.success && data?.session) {
        // Set up the Supabase session for future authenticated requests
        const { error: sessionError } = await setSupabaseSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        if (sessionError) {
          console.error('Failed to set Supabase session:', sessionError);
          return {
            success: false,
            error: { error: 'Failed to establish session' },
          };
        }

        return {
          success: true,
          data: data,
        };
      } else {
        return {
          success: false,
          error: { error: data?.error || 'Token exchange failed' },
        };
      }
    } catch (error) {
      console.error('OAuth callback error:', error);
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
   * Authentication is handled via Supabase JWT in Authorization header
   */
  async syncLeagueData(): Promise<ApiResponse<any>> {
    try {
      // Verify we have an active session before making the request
      const session = await getSupabaseSession();
      if (!session) {
        return {
          success: false,
          error: { error: 'No authenticated session' },
        };
      }

      const { data, error } = await supabase.functions.invoke(
        'sync-league-data',
        {
          body: {
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
   * Trigger immediate roster sync for a specific team
   * Used for post-triggered syncs (e.g., after user edits roster)
   * This is synchronous and waits for the sync to complete
   * Authentication is handled via Supabase JWT in Authorization header
   */
  async syncTeamRosterImmediate(
    yahooLeagueId: string,
    yahooTeamId: string
  ): Promise<ApiResponse<any>> {
    try {
      const session = await getSupabaseSession();
      if (!session) {
        console.log('No authenticated session, skipping immediate roster sync');
        return {
          success: false,
          error: { error: 'No authenticated session' },
        };
      }

      console.log(
        `Starting immediate roster sync for league ${yahooLeagueId}, team ${yahooTeamId}...`
      );

      const { data, error } = await supabase.functions.invoke(
        'sync-league-data',
        {
          body: {
            syncType: 'immediate-roster',
            yahooLeagueId,
            yahooTeamId,
          },
        }
      );

      if (error) {
        console.error('Immediate roster sync failed:', error.message);
        return {
          success: false,
          error: { error: error.message || 'Roster sync failed' },
        };
      }

      console.log('Immediate roster sync completed successfully', data);

      return {
        success: true,
        data: data,
      };
    } catch (error) {
      console.error('Error during immediate roster sync:', error);
      return {
        success: false,
        error: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Trigger periodic roster sync for all teams
   * Syncs all teams synchronously in the edge function
   * Authentication is handled via Supabase JWT in Authorization header
   */
  async triggerPeriodicRosterSync(): Promise<ApiResponse<any>> {
    try {
      const shouldSync = await this.shouldPerformPeriodicSync();
      if (!shouldSync) {
        console.log('Skipping periodic sync - too recent');
        return {
          success: false,
          error: { error: 'Periodic sync too recent' },
        };
      }

      const session = await getSupabaseSession();
      if (!session) {
        console.log('No authenticated session, skipping roster sync');
        return {
          success: false,
          error: { error: 'No authenticated session' },
        };
      }

      console.log('Starting periodic roster sync (all teams)...');

      // Call the sync-league-data function with job-roster-all
      // This syncs all teams synchronously in the edge function
      const { data, error } = await supabase.functions.invoke(
        'sync-league-data',
        {
          body: {
            syncType: 'job-roster-all',
          },
        }
      );

      if (error) {
        console.error('Periodic roster sync failed:', error.message);
        return {
          success: false,
          error: { error: error.message || 'Roster sync failed' },
        };
      }

      console.log('Periodic roster sync completed successfully', data);

      // Store the last sync time
      await chrome.storage.local.set({
        lastPeriodicSync: Date.now(),
      });
      console.log('Last periodic sync time updated');

      return {
        success: true,
        data: data,
      };
    } catch (error) {
      console.error('Error triggering periodic roster sync:', error);
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
   * Computes tips synchronously and returns them immediately
   * Authentication is handled via Supabase JWT in Authorization header
   */
  async getTips(): Promise<ApiResponse<any>> {
    try {
      const session = await getSupabaseSession();
      if (!session) {
        return {
          success: false,
          error: { error: 'No authenticated session' },
        };
      }

      const { data, error } = await supabase.functions.invoke('tips', {
        body: {
          mode: 'immediate',
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
   * Check initialization status for a user's leagues
   * Used to poll for completion during first-time setup
   * Authentication is handled via Supabase JWT in Authorization header
   */
  async checkInitializationStatus(): Promise<
    ApiResponse<{
      all_ready: boolean;
      leagues: {
        league_id: string;
        league_name: string;
        status: 'pending' | 'in_progress' | 'ready' | 'error';
        total_jobs: number;
        completed_jobs: number;
        current_step: string | null;
        error_message: string | null;
      }[];
    }>
  > {
    try {
      const session = await getSupabaseSession();
      if (!session) {
        return {
          success: false,
          error: { error: 'No authenticated session' },
        };
      }

      const { data, error } = await supabase.functions.invoke(
        'check-initialization-status',
        {
          body: {},
        }
      );

      if (error) {
        return {
          success: false,
          error: { error: error.message || 'Failed to check status' },
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
   * Trigger periodic tips refresh via VM job
   * Creates a job in the database for the VM to process asynchronously
   * Authentication is handled via Supabase JWT in Authorization header
   */
  async triggerPeriodicTipsRefresh(): Promise<ApiResponse<any>> {
    try {
      const session = await getSupabaseSession();
      if (!session) {
        console.log('No authenticated session, skipping tips refresh job');
        return {
          success: false,
          error: { error: 'No authenticated session' },
        };
      }

      console.log('Creating tips refresh job for VM...');

      const { data, error } = await supabase.functions.invoke('tips', {
        body: {
          mode: 'job',
        },
      });

      if (error) {
        console.error('Failed to create tips refresh job:', error.message);
        return {
          success: false,
          error: { error: error.message || 'Failed to create tips job' },
        };
      }

      console.log('Tips refresh job created successfully', data);

      return {
        success: true,
        data: data,
      };
    } catch (error) {
      console.error('Error creating tips refresh job:', error);
      return {
        success: false,
        error: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Get user ID from the current Supabase session
   * Used internally when user ID is needed for local operations
   */
  async getUserId(): Promise<string | null> {
    try {
      const session = await getSupabaseSession();
      if (!session?.user?.id) {
        console.error('No authenticated session or user ID');
        return null;
      }
      return session.user.id;
    } catch (error) {
      console.error('Error getting user ID from session:', error);
      return null;
    }
  }
}

export const apiClient = new ApiClient();
