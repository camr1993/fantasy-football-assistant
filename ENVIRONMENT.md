# Environment Variables Setup

This project uses different environment variables for local development and production builds.

## Environment Files

- `.env.local` - Used for local development (`npm run dev`)
- `.env.production` - Used for production builds (`npm run build`)

## Required Variables

Both environment files should contain:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Supabase Edge Functions Environment Variables

For the OAuth functionality, you need to set these environment variables in your Supabase project dashboard:

1. Go to your Supabase project dashboard
2. Navigate to Settings > Edge Functions > Environment Variables
3. Add the following variables:

```bash
# Yahoo OAuth Configuration
YAHOO_CLIENT_ID=your_yahoo_client_id_here
YAHOO_CLIENT_SECRET=your_yahoo_client_secret_here
YAHOO_APP_ID=your_yahoo_app_id_here

# Supabase Configuration (usually set automatically)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

## Yahoo OAuth Setup

1. **Create a Yahoo Developer App:**
   - Go to https://developer.yahoo.com/
   - Create a new application
   - Set the redirect URI to: `https://gauanzpirzdhbfbctlkg.supabase.co/functions/v1/oath/callback`
   - Note down your Client ID, Client Secret, and App ID

2. **Configure Environment Variables:**
   - Add the Yahoo credentials to your Supabase Edge Functions environment variables
   - Deploy the OAuth function: `supabase functions deploy oath`

## Setup Instructions

1. **For Local Development:**
   - Copy `.env.local` and replace the placeholder values with your local Supabase credentials
   - Run `npm run dev` to start development server

2. **For Production:**
   - Copy `.env.production` and replace the placeholder values with your production Supabase credentials
   - Run `npm run build` to create production build

3. **For OAuth Function:**
   - Set the environment variables in Supabase dashboard
   - Deploy the function: `supabase functions deploy oath`

## How It Works

- Vite automatically loads the appropriate environment file based on the mode
- `npm run dev` uses `--mode development` which loads `.env.local`
- `npm run build` uses `--mode production` which loads `.env.production`
- Environment variables are prefixed with `VITE_` to be accessible in your React components
- Edge Functions use environment variables set in the Supabase dashboard

## Security Note

- Environment files are excluded from version control (see `.gitignore`)
- Never commit actual credentials to the repository
- Use different Supabase projects/keys for development and production
- Yahoo OAuth credentials should only be stored in Supabase Edge Functions environment variables
