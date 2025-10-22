# Fantasy Football Data Sync System

This system has been refactored to use a job-based architecture with a VM that processes sync tasks on-demand.

## Architecture Overview

### 🏗️ Components

1. **Jobs Table**: Central job queue in Supabase
2. **VM (Virtual Machine)**: Processes jobs and shuts down when complete
3. **Edge Functions**: Create jobs and start the VM
4. **Autostop**: VM automatically stops when idle (based on [Fly.io autostop/autostart](https://fly.io/docs/launch/autostop-autostart/))

### 📊 Database Schema

#### `jobs` table

- `id`: UUID primary key
- `name`: Job type (sync-players, sync-injuries, etc.)
- `status`: pending, running, completed, failed
- `week`: Optional week parameter
- `created_at`, `updated_at`: Timestamps

#### `job_history` table

- Stores completed/failed jobs for historical tracking
- Automatically populated via database triggers

### 🔄 Workflow

1. **Cron triggers edge function** → Creates jobs in database
2. **Edge function starts VM** → VM polls for jobs
3. **VM processes jobs** → Updates job status
4. **VM shuts down** → When no more jobs or timeout reached

## 📁 File Structure

```
vm/
├── src/
│   ├── index.ts                    # Main VM job processor
│   └── sync-functions/             # All sync logic (moved from edge functions)
│       ├── sync-players/
│       ├── sync-injuries/
│       ├── sync-player-stats/
│       ├── sync-nfl-matchups/
│       ├── sync-opponents/
│       ├── sync-league-data/
│       ├── sync-defense-points-against/
│       └── league-calcs/
├── package.json
├── tsconfig.json
├── Dockerfile
├── fly.toml                        # VM configuration with autostop
└── README.md

supabase/functions/
├── daily-data-sync/                # Creates daily jobs (injuries)
├── weekly-data-sync/               # Creates weekly jobs (players, stats, etc.)
├── annual-data-sync/               # Creates annual jobs (matchups)
└── utils/                          # Shared utilities
```

## 🚀 Deployment

### 1. Deploy Database Migration

```bash
supabase db push
```

### 2. Deploy VM

```bash
cd vm
fly apps create fantasy-football-sync-vm
fly secrets set SUPABASE_URL=your_supabase_url
fly secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
fly secrets set YAHOO_CLIENT_ID=your_yahoo_client_id
fly secrets set YAHOO_CLIENT_SECRET=your_yahoo_client_secret
fly secrets set SUPER_ADMIN_USER_ID=your_admin_user_id
fly secrets set FLY_API_TOKEN=your_fly_api_token
fly secrets set VM_APP_NAME=fantasy-football-sync-vm
fly deploy
```

### 3. Deploy Edge Functions

```bash
supabase functions deploy daily-data-sync
supabase functions deploy weekly-data-sync
supabase functions deploy annual-data-sync
```

## ⚙️ Configuration

### VM Autostop Settings

The VM is configured with [Fly.io autostop/autostart](https://fly.io/docs/launch/autostop-autostart/):

- `auto_stop_machines = "stop"`: VM stops when idle
- `auto_start_machines = true`: VM starts when jobs are created
- `min_machines_running = 0`: No minimum running machines

### Job Types

#### Daily Jobs (`daily-data-sync`)

- `sync-injuries`: Updates player injury status

#### Weekly Jobs (`weekly-data-sync`)

- `sync-players`: Updates player information
- `sync-player-stats`: Updates player statistics for specific week
- `sync-opponents`: Updates opponent matchups
- `sync-league-data`: Updates league-specific data
- `sync-defense-points-against`: Updates defense statistics
- `league-calcs`: Calculates league-specific metrics

#### Annual Jobs (`annual-data-sync`)

- `sync-nfl-matchups`: Updates NFL schedule/matchups

## 🔍 Monitoring

### VM Status

```bash
fly status
fly logs
```

### Job Status

```sql
-- Check pending jobs
SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at;

-- Check job history
SELECT * FROM job_history ORDER BY completed_at DESC LIMIT 10;
```

### Health Check

The VM exposes a health endpoint at `/health` for monitoring.

## 🛡️ Safety Features

1. **Timeout Protection**: VM stops after 30 minutes maximum runtime
2. **Job Limit**: Maximum 50 jobs per VM run to prevent infinite loops
3. **Error Handling**: Failed jobs are logged and VM continues with next job
4. **Graceful Shutdown**: VM properly closes HTTP server and exits
5. **Autostop**: VM automatically stops when idle (no jobs)

## 🔧 Environment Variables

### VM Secrets

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key
- `YAHOO_CLIENT_ID`: Yahoo API client ID
- `YAHOO_CLIENT_SECRET`: Yahoo API client secret
- `SUPER_ADMIN_USER_ID`: Admin user ID with Yahoo tokens
- `FLY_API_TOKEN`: Fly.io API token for VM control
- `VM_APP_NAME`: Name of the VM app

### Edge Function Secrets

- `CRON_JOB_SECRET`: Secret for cron job authentication
- `VM_APP_NAME`: Name of the VM app to start
- `FLY_API_TOKEN`: Fly.io API token for VM control

## 📈 Benefits

1. **Cost Efficient**: VM only runs when there's work to do
2. **Scalable**: Can handle multiple jobs in sequence
3. **Reliable**: Automatic retry and error handling
4. **Maintainable**: All sync logic centralized in VM
5. **Observable**: Comprehensive logging and job tracking
6. **Modular**: Easy to add new sync functions

## 🚨 Troubleshooting

### VM Not Starting

- Check Fly API token permissions
- Verify VM app name matches configuration
- Check Fly.io logs for startup errors

### Jobs Not Processing

- Check VM logs: `fly logs`
- Verify database connection
- Check Yahoo API token validity

### Jobs Stuck in Running State

- VM may have crashed - check logs
- Manually update job status in database
- Restart VM if needed
