# FantasyEdge

A Chrome extension that provides personalized fantasy football recommendations for Yahoo Fantasy Football users. FantasyEdge analyzes your roster and league data to offer start/bench advice and waiver wire suggestions directly on Yahoo Fantasy pages.

## Features

- **Start/Bench Recommendations**: Get advice on which players to start or bench based on matchups, recent performance, and league scoring
- **Waiver Wire Suggestions**: See upgrade opportunities comparing your rostered players to available free agents
- **In-Page Integration**: Recommendations appear as icons directly next to players on Yahoo Fantasy pages
- **Automatic Sync**: Roster data syncs automatically when you make changes or periodically in the background

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Chrome Extension                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐  │
│  │   Popup UI   │  │  Background  │  │  Content Script (Yahoo FF)   │  │
│  │  (React)     │  │  Service     │  │  - Injects recommendation    │  │
│  │  - Auth      │  │  Worker      │  │    icons next to players     │  │
│  │  - Status    │  │  - Sync      │  │  - Shows modals with details │  │
│  └──────────────┘  │  - Tips      │  └──────────────────────────────┘  │
│                    └──────────────┘                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Supabase Backend                                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Edge Functions                                                    │  │
│  │  - oauth/         OAuth flow with Yahoo                           │  │
│  │  - sync-league-data/  Sync leagues, teams, rosters               │  │
│  │  - tips/          Compute start/bench & waiver recommendations    │  │
│  │  - daily-data-sync/   Cron job for injuries                      │  │
│  │  - weekly-data-sync/  Cron job for player stats                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  PostgreSQL Database                                               │  │
│  │  - Users, leagues, teams, rosters                                 │  │
│  │  - Player stats, injuries, matchups                               │  │
│  │  - Computed league calculations & recommendations                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Fly.io VM (Job Processor)                        │
│  - Processes long-running sync jobs (players, stats, matchups)          │
│  - Auto-starts when jobs are queued, auto-stops when idle               │
│  - Handles Yahoo API rate limits and large data fetches                 │
└─────────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
├── src/                          # Chrome extension source
│   ├── api/
│   │   └── client.ts             # API client for Supabase functions
│   ├── background/
│   │   └── background.ts         # Service worker (sync, messaging)
│   ├── content/
│   │   └── content.tsx           # Content script (UI injection)
│   ├── popup/
│   │   ├── popup.html            # Extension popup HTML
│   │   └── popup.tsx             # Popup UI (auth, status)
│   ├── types/                    # TypeScript types
│   └── supabaseClient.ts         # Supabase client config
│
├── supabase/functions/           # Supabase Edge Functions
│   ├── oauth/                    # Yahoo OAuth flow
│   ├── sync-league-data/         # League/team/roster sync
│   ├── tips/                     # Recommendation engine
│   ├── check-initialization-status/
│   ├── daily-data-sync/          # Daily cron (injuries)
│   ├── weekly-data-sync/         # Weekly cron (stats)
│   ├── annual-data-sync/         # Annual cron (schedule)
│   └── utils/                    # Shared utilities
│
├── vm/                           # Fly.io VM job processor
│   └── src/
│       ├── index.ts              # Job queue processor
│       └── sync-functions/       # Sync implementations
│           ├── playerSync.ts
│           ├── injurySync.ts
│           ├── leagueSync.ts
│           ├── sync-player-stats/
│           ├── leagueCalcs/
│           └── ...
│
├── public/                       # Extension icons
├── manifest.json                 # Chrome extension manifest
├── vite.config.ts                # Vite config for popup
├── vite.content.config.ts        # Vite config for content script
└── fly.toml                      # Fly.io VM configuration
```

## Development

### Prerequisites

- Node.js 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Fly.io CLI](https://fly.io/docs/hands-on/install-flyctl/) (for VM deployment)

### Extension Development

```bash
# Install dependencies
npm install

# Build extension (outputs to dist/)
npm run build

# Build and create zip for Chrome Web Store
npm run build:zip
```

### Load Extension in Chrome

1. Build the extension: `npm run build`
2. Open Chrome → `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" → select the `dist/` folder

### Supabase Development

```bash
# Start local Supabase
supabase start

# Deploy edge functions
supabase functions deploy

# Run database migrations
supabase db push
```

## Deployment

### Edge Functions

```bash
supabase functions deploy oauth
supabase functions deploy sync-league-data
supabase functions deploy tips
supabase functions deploy check-initialization-status
supabase functions deploy daily-data-sync
supabase functions deploy weekly-data-sync
supabase functions deploy annual-data-sync
```

### VM (Fly.io)

```bash
# Set secrets
fly secrets set SUPABASE_URL=your_supabase_url
fly secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
fly secrets set YAHOO_CLIENT_ID=your_yahoo_client_id
fly secrets set YAHOO_CLIENT_SECRET=your_yahoo_client_secret
fly secrets set SUPER_ADMIN_USER_ID=your_admin_user_id
fly secrets set FLY_API_TOKEN=your_fly_api_token
fly secrets set VM_APP_NAME=fantasy-football-assistant-vm

# Deploy
fly deploy
```

### Chrome Web Store

1. Build the extension: `npm run build:zip`
2. Upload `fantasy-assistant-extension.zip` to Chrome Web Store Developer Dashboard

## Environment Variables

### Supabase Edge Functions

| Variable              | Description                        |
| --------------------- | ---------------------------------- |
| `YAHOO_CLIENT_ID`     | Yahoo API client ID                |
| `YAHOO_CLIENT_SECRET` | Yahoo API client secret            |
| `FLY_API_TOKEN`       | Fly.io API token for VM control    |
| `VM_APP_NAME`         | Name of the Fly.io VM app          |
| `CRON_JOB_SECRET`     | Secret for cron job authentication |

### VM

| Variable                    | Description                     |
| --------------------------- | ------------------------------- |
| `SUPABASE_URL`              | Supabase project URL            |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key                |
| `YAHOO_CLIENT_ID`           | Yahoo API client ID             |
| `YAHOO_CLIENT_SECRET`       | Yahoo API client secret         |
| `SUPER_ADMIN_USER_ID`       | Admin user ID with Yahoo tokens |
| `FLY_API_TOKEN`             | Fly.io API token                |
| `VM_APP_NAME`               | Name of the VM app              |

## Monitoring

### VM Status

```bash
fly status
fly logs
```

### Job Status

```sql
-- Check pending jobs
SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at;

-- Check recent job history
SELECT * FROM job_history ORDER BY completed_at DESC LIMIT 10;
```

## License

Private - All rights reserved
