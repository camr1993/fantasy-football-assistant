import { logger } from './logger.ts';
import { supabase } from './supabase.ts';
import { YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET } from './constants.ts';

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

class EdgeTokenManager {
  private static instance: EdgeTokenManager;
  private refreshPromises: Map<string, Promise<TokenData | null>> = new Map();

  static getInstance(): EdgeTokenManager {
    if (!EdgeTokenManager.instance) {
      EdgeTokenManager.instance = new EdgeTokenManager();
    }
    return EdgeTokenManager.instance;
  }

  /**
   * Get valid access token for a user, refreshing if necessary
   */
  async getValidAccessToken(userId: string): Promise<string | null> {
    try {
      // Get user from Supabase
      const { data: user, error: userError } =
        await supabase.auth.admin.getUserById(userId);

      if (userError || !user) {
        logger.error('Failed to get user', { error: userError, userId });
        return null;
      }

      const userMetadata = user.user.user_metadata as YahooUser;

      if (
        !userMetadata?.yahoo_access_token ||
        !userMetadata?.yahoo_refresh_token
      ) {
        logger.warn('No Yahoo tokens found in user metadata', { userId });
        return null;
      }

      // Check if token is expired or about to expire (refresh 5 minutes before expiry)
      const expiresAt = new Date(userMetadata.yahoo_token_expires_at);
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

      if (expiresAt <= fiveMinutesFromNow) {
        logger.info('Token is expired or about to expire, refreshing...', {
          userId,
        });
        const refreshedTokens = await this.refreshTokens(
          userId,
          userMetadata.yahoo_refresh_token
        );
        return refreshedTokens?.access_token || null;
      }

      return userMetadata.yahoo_access_token;
    } catch (error) {
      logger.error('Error getting valid access token', { error, userId });
      return null;
    }
  }

  /**
   * Refresh tokens using the refresh token
   */
  private async refreshTokens(
    userId: string,
    refreshToken: string
  ): Promise<TokenData | null> {
    // Prevent multiple simultaneous refresh attempts for the same user
    if (this.refreshPromises.has(userId)) {
      return this.refreshPromises.get(userId)!;
    }

    const refreshPromise = this.performTokenRefresh(userId, refreshToken);
    this.refreshPromises.set(userId, refreshPromise);

    try {
      const result = await refreshPromise;
      return result;
    } finally {
      this.refreshPromises.delete(userId);
    }
  }

  private async performTokenRefresh(
    userId: string,
    refreshToken: string
  ): Promise<TokenData | null> {
    try {
      logger.info('Refreshing tokens for user', { userId });

      const tokenResponse = await fetch(
        'https://api.login.yahoo.com/oauth2/get_token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${btoa(`${YAHOO_CLIENT_ID}:${YAHOO_CLIENT_SECRET}`)}`,
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }),
        }
      );

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        logger.error('Token refresh failed', { errorText, userId });
        return null;
      }

      const tokenData = await tokenResponse.json();
      logger.info('Token refresh successful', {
        hasAccessToken: !!tokenData.access_token,
        hasRefreshToken: !!tokenData.refresh_token,
        userId,
      });

      // Update user's tokens in Supabase
      const { error: userError } = await supabase.auth.admin.updateUserById(
        userId,
        {
          user_metadata: {
            yahoo_access_token: tokenData.access_token,
            yahoo_refresh_token: tokenData.refresh_token,
            yahoo_token_expires_at: new Date(
              Date.now() + tokenData.expires_in * 1000
            ).toISOString(),
          },
        }
      );

      if (userError) {
        logger.error('Failed to update user tokens', {
          error: userError,
          userId,
        });
        return null;
      }

      return {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: new Date(
          Date.now() + tokenData.expires_in * 1000
        ).toISOString(),
      };
    } catch (error) {
      logger.error('Error refreshing tokens', { error, userId });
      return null;
    }
  }

  /**
   * Make a Yahoo API call with automatic token refresh
   */
  async makeYahooApiCall(
    userId: string,
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const accessToken = await this.getValidAccessToken(userId);

    if (!accessToken) {
      throw new Error('No valid access token available');
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    logger.info('Making Yahoo API call', { url, userId });

    return fetch(url, {
      ...options,
      headers,
    });
  }

  /**
   * Check if user has valid Yahoo tokens
   */
  async hasValidTokens(userId: string): Promise<boolean> {
    try {
      const { data: user, error } =
        await supabase.auth.admin.getUserById(userId);

      if (error || !user) {
        return false;
      }

      const userMetadata = user.user.user_metadata as YahooUser;

      if (
        !userMetadata?.yahoo_access_token ||
        !userMetadata?.yahoo_refresh_token
      ) {
        return false;
      }

      // Check if token is expired
      const expiresAt = new Date(userMetadata.yahoo_token_expires_at);
      const now = new Date();

      return expiresAt > now;
    } catch (error) {
      logger.error('Error checking token validity', { error, userId });
      return false;
    }
  }
}

export const edgeTokenManager = EdgeTokenManager.getInstance();
