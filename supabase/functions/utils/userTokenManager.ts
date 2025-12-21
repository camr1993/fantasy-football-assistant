import { logger } from './logger.ts';
import { supabase } from './supabase.ts';
import {
  YAHOO_CLIENT_ID,
  YAHOO_CLIENT_SECRET,
} from '../oauth/utils/constants.ts';

export interface UserTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  user_id: string;
  email: string;
}

/**
 * Get user's Yahoo tokens by email or user ID
 */
export async function getYahooUserTokens(
  userId: string
): Promise<UserTokens | null> {
  try {
    const { data: userData, error: userError } =
      await supabase.auth.admin.getUserById(userId);

    if (userError || !userData) {
      logger.error('User not found by ID', {
        userId,
        idError: userError,
      });
      return null;
    }

    const userMetadata = userData?.user?.user_metadata;

    if (
      !userMetadata?.yahoo_access_token ||
      !userMetadata?.yahoo_refresh_token
    ) {
      logger.error('User has no Yahoo tokens', {
        userId,
        hasAccessToken: !!userMetadata?.yahoo_access_token,
        hasRefreshToken: !!userMetadata?.yahoo_refresh_token,
      });
      return null;
    }

    // Check if token is expired and refresh if needed
    const expiresAt = new Date(userMetadata?.yahoo_token_expires_at);
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiresAt <= fiveMinutesFromNow) {
      logger.info('Token is expired or about to expire, refreshing...', {
        userId,
        expiresAt: userMetadata?.yahoo_token_expires_at,
      });

      const refreshedTokens = await refreshUserTokens(
        userId,
        userMetadata?.yahoo_refresh_token
      );

      if (!refreshedTokens) {
        logger.error('Failed to refresh tokens for user', { userId });
        return null;
      }

      return {
        access_token: refreshedTokens.access_token,
        refresh_token: refreshedTokens.refresh_token,
        expires_at: refreshedTokens.expires_at,
        user_id: userId,
        email: userMetadata?.user?.email,
      };
    }

    return {
      access_token: userMetadata?.yahoo_access_token,
      refresh_token: userMetadata?.yahoo_refresh_token,
      expires_at: userMetadata?.yahoo_token_expires_at,
      user_id: userId,
      email: userMetadata?.user?.email,
    };
  } catch (error) {
    logger.error('Error getting user tokens', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Refresh user's Yahoo tokens
 */
async function refreshUserTokens(
  userId: string,
  refreshToken: string
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_at: string;
} | null> {
  try {
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
      logger.error('Token refresh failed', {
        userId,
        status: tokenResponse.status,
        errorText,
      });
      return null;
    }

    const tokenData = await tokenResponse.json();
    const expiresAt = new Date(
      Date.now() + tokenData.expires_in * 1000
    ).toISOString();

    // Update user's tokens in Supabase
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      userId,
      {
        user_metadata: {
          yahoo_access_token: tokenData.access_token,
          yahoo_refresh_token: tokenData.refresh_token || refreshToken,
          yahoo_token_expires_at: expiresAt,
        },
      }
    );

    if (updateError) {
      logger.error('Failed to update user tokens in database', {
        userId,
        error: updateError,
      });
      return null;
    }

    logger.info('Successfully refreshed and updated user tokens', {
      userId,
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
    });

    return {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || refreshToken,
      expires_at: expiresAt,
    };
  } catch (error) {
    logger.error('Error refreshing user tokens', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
