# Antistatic Landing Page

A Next.js 14+ landing page for Antistatic AI with Google Places autocomplete integration.

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file with the following environment variables:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
GOOGLE_PLACES_API_KEY=your_google_places_api_key
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
GBP_CLIENT_ID=your_gbp_client_id
GBP_CLIENT_SECRET=your_gbp_client_secret
GBP_REDIRECT_URI=your_gbp_redirect_uri
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features

- Google-inspired landing page design
- Google Places autocomplete (server-side proxy)
- Business selection and navigation to report page
- Report page placeholder with stepper UI

## Project Structure

```
app/
  api/places/autocomplete/route.ts  # Google Places API proxy
  layout.tsx                        # Root layout with Inter font
  page.tsx                          # Landing page
  report/page.tsx                   # Report page placeholder
  globals.css                       # Global styles

components/landing/
  Nav.tsx                           # Navigation component
  Hero.tsx                          # Hero section
  BusinessSearch.tsx                # Search input with autocomplete
  Decor.tsx                         # Background decoration

lib/
  types.ts                          # TypeScript types
  utils/debounce.ts                 # Debounce utility
```

