# OAuth Edge Function

This Supabase Edge Function handles Yahoo OAuth 2.0 authentication for the Fantasy Football Assistant Chrome extension.

## Structure

```
oath/
├── index.ts                    # Main entry point with routing
├── handlers/                   # Request handlers
│   ├── oauth-callback.ts      # Handles OAuth callback from Yahoo
│   ├── oauth-initiation.ts    # Handles OAuth initiation
│   └── token-refresh.ts       # Handles token refresh
├── utils/                      # Shared utilities
│   ├── constants.ts           # OAuth configuration and CORS headers
│   ├── jwt.ts                 # JWT parsing utilities
│   ├── logger.ts              # Structured logging and performance timing
│   └── supabase.ts            # Supabase client configuration
└── README.md                  # This file
```

## Endpoints

- `GET/POST /auth` - Initiate OAuth flow with Yahoo
- `GET/POST /callback` - Handle OAuth callback from Yahoo
- `POST /refresh` - Refresh expired access tokens

## Features

- **Structured Logging**: JSON-formatted logs with levels (INFO, WARN, ERROR, DEBUG)
- **Performance Monitoring**: Request timing and performance metrics
- **Scalable User Lookup**: Uses custom PostgreSQL functions instead of listing all users
- **Error Handling**: Comprehensive error handling with detailed logging
- **CORS Support**: Proper CORS headers for Chrome extension requests

## Environment Variables

- `YAHOO_CLIENT_ID` - Yahoo OAuth client ID
- `YAHOO_CLIENT_SECRET` - Yahoo OAuth client secret
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key

## Database Functions

- `get_user_by_email(user_email TEXT)` - Lookup user by email address
- `get_user_by_yahoo_id(yahoo_user_id TEXT)` - Lookup user by Yahoo ID

## Logging

All logs are structured JSON with the following format:

```json
{
  "level": "INFO|WARN|ERROR|DEBUG",
  "timestamp": "2024-01-11T10:30:45.123Z",
  "message": "Human readable message",
  "data": {
    /* Additional context */
  }
}
```

View logs in the Supabase Dashboard under Functions → oath → Logs.
