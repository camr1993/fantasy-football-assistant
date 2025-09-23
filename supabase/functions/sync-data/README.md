# Sync Data Edge Function

This edge function is designed to sync Yahoo API data to Supabase and is triggered by pg_cron jobs.

## Authentication

The function uses a cron job secret for authentication, allowing it to be called by Supabase's pg_cron extension without requiring user authentication.

## Environment Variables

- `CRON_JOB_SECRET`: A secret key used to authenticate cron job requests

## Usage

### Local Development

1. Start Supabase locally: `supabase start`
2. Set the `CRON_JOB_SECRET` environment variable
3. Test the function:

```bash
curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/sync-data' \
  --header 'x-cron-secret: your-secret-here' \
  --header 'Content-Type: application/json'
```

### Production Setup

1. Deploy the function to Supabase
2. Set the `CRON_JOB_SECRET` environment variable in your Supabase project
3. Set up the cron job using pg_cron:

```sql
SELECT cron.schedule(
  'sync-yahoo-data',
  '0 */6 * * *', -- Every 6 hours
  'SELECT net.http_post(
    url:=''https://your-project.supabase.co/functions/v1/sync-data'',
    headers:=''{"x-cron-secret": "your-secret-here", "Content-Type": "application/json"}''::jsonb
  );'
);
```

## Response Format

### Success Response

```json
{
  "success": true,
  "message": "Data sync process completed successfully",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "syncId": "uuid-here",
  "duration": 123.45
}
```

### Error Response

```json
{
  "error": "Error type",
  "message": "Error description",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Implementation Status

Currently, this function only logs the sync process. The actual data synchronization logic will be implemented in future iterations.

## Security Notes

- The cron job secret should be a strong, randomly generated string
- Never commit the secret to version control
- Rotate the secret periodically for security
