# Environment Variables Setup

## Google Maps API Key

To use the competitor map feature, you need to set up a public-facing Google Maps API key.

### Required Environment Variable

Add to your `.env.local` file:

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

### How to Get the Key

1. Copy the value from your existing `GOOGLE_MAPS_API_KEY` environment variable
2. Add it as `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env.local`

**Note:** The `NEXT_PUBLIC_` prefix makes this variable available to the browser. This is required for the Google Maps JavaScript API to work on the client side.

### API Requirements

Make sure your Google Maps API key has the following APIs enabled:
- Maps JavaScript API
- Places API (for nearby search)

### Security Note

Since this is a public key (exposed to the browser), make sure to:
- Restrict the API key to your domain in Google Cloud Console
- Set up API key restrictions to only allow Maps JavaScript API and Places API


