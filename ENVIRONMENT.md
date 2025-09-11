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

## Setup Instructions

1. **For Local Development:**
   - Copy `.env.local` and replace the placeholder values with your local Supabase credentials
   - Run `npm run dev` to start development server

2. **For Production:**
   - Copy `.env.production` and replace the placeholder values with your production Supabase credentials
   - Run `npm run build` to create production build

## How It Works

- Vite automatically loads the appropriate environment file based on the mode
- `npm run dev` uses `--mode development` which loads `.env.local`
- `npm run build` uses `--mode production` which loads `.env.production`
- Environment variables are prefixed with `VITE_` to be accessible in your React components

## Security Note

- Environment files are excluded from version control (see `.gitignore`)
- Never commit actual credentials to the repository
- Use different Supabase projects/keys for development and production
