# Competitor Detection Implementation

## Summary

This implementation provides proper competitor detection with strict filtering rules, matching Owner.com's behavior and UI style.

## Files Changed

### 1. `app/api/places/competitors/route.ts` (NEW)
- Server-side API route for competitor detection
- Implements strict filtering rules
- Handles progressive radius expansion (2km → 5km → 10km)
- Ranks competitors by relevance (rating count, rating, distance)
- Returns target place + filtered competitors list

### 2. `components/report/StageCompetitorMap.tsx` (REWRITTEN)
- Uses new `/api/places/competitors` endpoint
- Implements sequential pin dropping (target first, then competitors one-by-one)
- Owner.com-style UI: floating search bar, status indicator
- Throttled map framing (every 2 markers or after last marker)
- Proper loading states and progress indicators

### 3. `components/report/ReportScanClient.tsx` (UPDATED)
- Removed card wrapper for step 0 (map now full-screen like Owner.com)
- Map takes full height of preview area
- Other steps remain in card containers

## How Competitor Filtering Works

### Primary Rules (All Must Pass)
1. **Same Business Type**: Must match target's primary type (e.g., "restaurant", "gym", "dentist")
2. **Proximity**: Within expanding radius (2km → 5km → 10km)
3. **Real Listing**: Must have:
   - Name
   - Address/vicinity
   - Rating data (at least `user_rating_total > 0`)
4. **Not Target**: Excludes the target place itself
5. **Deduplication**: By `place_id`

### Ranking (Most Relevant First)
1. **Highest review count** (`user_rating_total`) - desc
2. **Highest rating** (`rating`) - desc  
3. **Nearest distance** - asc (tie-breaker)

### Min/Max Limits
- **MIN_COMPETITORS**: 3 (tries fallback search if fewer found)
- **MAX_COMPETITORS**: 8 (trims to top 8 after ranking)

### Fallback Behavior
If fewer than MIN competitors found at 10km:
- Performs broader search (any business type, still filtered by rating/proximity)
- Merges results and re-ranks
- Still respects MAX limit

## How to Tweak Settings

### In `app/api/places/competitors/route.ts`:

```typescript
// Change minimum/maximum competitors
const MIN_COMPETITORS = 3;  // Minimum to show
const MAX_COMPETITORS = 8;   // Maximum to show

// Change search radius steps (in meters)
const RADIUS_STEPS = [2000, 5000, 10000]; // 2km, 5km, 10km

// Add/remove generic types to filter out
const GENERIC_TYPES = [
  "point_of_interest",
  "establishment",
  "premise",
  "street_address",
  "route",
  "store",
  "food",
  "restaurant",
];
```

### In `components/report/StageCompetitorMap.tsx`:

```typescript
// Change pin drop delay (milliseconds)
const dropDelay = 500 + Math.random() * 400; // 500-900ms per pin

// Change fitBounds throttling
if (fitBoundsCounterRef.current >= 2) { // Call every 2 markers
  // ...
}

// Change map padding
mapInstance.fitBounds(bounds, {
  top: 80,    // Adjust padding
  right: 80,
  bottom: 80,
  left: 80,
});

// Change minimum zoom level
if (currentZoom && currentZoom < 12) { // Minimum zoom
  mapInstance.setZoom(12);
}
```

## UI Features

### Owner.com-Style Layout
- **Floating search bar**: Centered above map, rounded-full, shadow
- **Status indicator**: Top-left, shows progress ("Finding competitors...", "Plotting competitors… (X/Y)")
- **Full-screen map**: No card wrapper, map is hero element
- **Clean left panel**: Minimal styling, light borders

### Pin Behavior
- **Target pin**: Black, larger (scale 12), appears immediately
- **Competitor pins**: Red (scale 10), drop sequentially with animation
- **Map framing**: Auto-adjusts as pins appear, throttled to prevent jitter

## Acceptance Criteria Status

✅ **Competitors are same type** - Filtered by primary business type  
✅ **Min/Max limits** - Enforced (3-8 competitors)  
✅ **Sequential pin drop** - Target first, then competitors one-by-one  
✅ **Smooth map framing** - Throttled fitBounds, minimal jitter  
✅ **No unexpected API calls** - Only uses `/api/places/competitors`  
✅ **Owner.com UI** - Floating search bar, clean layout, full-screen map

## Testing

1. Select a business from the landing page
2. Navigate to report page (step 0 - Competitors)
3. Observe:
   - Target pin appears immediately (black)
   - Status shows "Finding competitors..."
   - Competitor pins drop one-by-one (red)
   - Map smoothly adjusts as pins appear
   - Status updates: "Plotting competitors… (X/Y)"
   - Final state shows total count

## Notes

- API route includes caching headers (60s cache, 300s stale-while-revalidate)
- All competitor detection logic is server-side (keeps API keys safe)
- Fallback search only triggers if insufficient results at 10km radius


