export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

export interface YahooUser {
  id: string;
  name: string;
  email: string;
  yahoo_access_token: string;
  yahoo_refresh_token: string;
  yahoo_token_expires_at: string;
}

class TokenManager {
  private static instance: TokenManager;
  private refreshPromise: Promise<TokenData | null> | null = null;

  static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  /**
   * Get valid access token, refreshing if necessary
   */
  async getValidAccessToken(): Promise<string | null> {
    try {
      // Get user data from Chrome storage instead of Supabase auth
      const result = await chrome.storage.local.get(['yahoo_user']);
      const user = result.yahoo_user as YahooUser;

      if (!user) {
        console.error('No user found in Chrome storage');
        return null;
      }

      if (!user?.yahoo_access_token || !user?.yahoo_refresh_token) {
        console.error('No Yahoo tokens found in user data');
        return null;
      }

      // Check if token is expired or about to expire (refresh 5 minutes before expiry)
      const expiresAt = new Date(user.yahoo_token_expires_at);
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

      if (expiresAt <= fiveMinutesFromNow) {
        console.log('Token is expired or about to expire, refreshing...');
        const refreshedTokens = await this.refreshTokens(
          user.yahoo_refresh_token
        );
        return refreshedTokens?.access_token || null;
      }

      return user.yahoo_access_token;
    } catch (error) {
      console.error('Error getting valid access token:', error);
      return null;
    }
  }

  /**
   * Refresh tokens using the refresh token
   */
  private async refreshTokens(refreshToken: string): Promise<TokenData | null> {
    // Prevent multiple simultaneous refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performTokenRefresh(refreshToken);

    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async performTokenRefresh(
    refreshToken: string
  ): Promise<TokenData | null> {
    try {
      // Get user ID from local storage for the refresh call
      const result = await chrome.storage.local.get(['yahoo_user']);
      const user = result.yahoo_user;

      if (!user || !user.id) {
        console.error('No user ID found in local storage for token refresh');
        return null;
      }

      const response = await fetch(
        'https://gauanzpirzdhbfbctlkg.supabase.co/functions/v1/oauth/refresh',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            refresh_token: refreshToken,
            user_id: user.id,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Token refresh failed:', errorText);
        return null;
      }

      const data = await response.json();

      if (data.success) {
        // Update local storage with new tokens
        await this.updateLocalTokens(data);
        return {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: new Date(
            Date.now() + data.expires_in * 1000
          ).toISOString(),
        };
      } else {
        console.error('Token refresh failed:', data.error);
        return null;
      }
    } catch (error) {
      console.error('Error refreshing tokens:', error);
      return null;
    }
  }

  /**
   * Update tokens in Chrome storage
   */
  private async updateLocalTokens(tokenData: any): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['yahoo_user']);
      if (result.yahoo_user) {
        const updatedUser = {
          ...result.yahoo_user,
          yahoo_access_token: tokenData.access_token,
          yahoo_refresh_token: tokenData.refresh_token,
          yahoo_token_expires_at: new Date(
            Date.now() + tokenData.expires_in * 1000
          ).toISOString(),
        };
        await chrome.storage.local.set({ yahoo_user: updatedUser });
      }
    } catch (error) {
      console.error('Error updating local tokens:', error);
    }
  }

  /**
   * Check if user has valid Yahoo tokens
   */
  async hasValidTokens(): Promise<boolean> {
    try {
      // Get user data from Chrome storage instead of Supabase auth
      const result = await chrome.storage.local.get(['yahoo_user']);
      const user = result.yahoo_user as YahooUser;

      if (!user) {
        return false;
      }

      if (!user?.yahoo_access_token || !user?.yahoo_refresh_token) {
        return false;
      }

      // Check if token is expired
      const expiresAt = new Date(user.yahoo_token_expires_at);
      const now = new Date();

      return expiresAt > now;
    } catch (error) {
      console.error('Error checking token validity:', error);
      return false;
    }
  }

  /**
   * Clear all tokens (for logout)
   */
  async clearTokens(): Promise<void> {
    try {
      await chrome.storage.local.remove(['yahoo_user']);
    } catch (error) {
      console.error('Error clearing tokens:', error);
    }
  }
}

export const tokenManager = TokenManager.getInstance();
