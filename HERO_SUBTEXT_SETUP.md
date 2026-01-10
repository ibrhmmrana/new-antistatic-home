# Hero Subtext Animation Setup - Brief

## Component Structure
**File:** `components/landing/RotatingText.tsx`

## How It Works

### State Management
- `currentIndex`: Tracks which text from the array is currently displayed (0-3)
- `isAnimating`: Boolean flag that triggers the animation transition

### Text Array
4 rotating messages:
1. "Scan your site and see what isn't working"
2. "Find out how to get discovered on Google"
3. "See how many reviews you could generate"
4. "Compare yourself with your local competition"

### Animation Logic
1. **Interval Timer**: Every 4 seconds, `isAnimating` is set to `true`
2. **Current Text**: Uses Tailwind transition classes:
   - When `isAnimating = false`: `translate-y-0 opacity-100` (visible)
   - When `isAnimating = true`: `-translate-y-full opacity-0` (slides up and fades out)
   - Transition duration: `duration-600` (600ms)
3. **Next Text**: Only rendered when `isAnimating = true`:
   - Uses CSS animation `animate-slide-up-in` (defined in globals.css)
   - Positioned absolutely at `top-0 left-0`
   - Slides up from below using keyframe animation
4. **Index Update**: After 600ms (when slide-out completes), `currentIndex` increments and `isAnimating` resets to `false`

### CSS Animations (globals.css)
- `@keyframes slideUpIn`: Animates from `translateY(100%)` to `translateY(0)` with 300ms delay
- Applied via class `animate-slide-up-in`

### Current Issue
The animation has a problem where:
- The current text slides up and disappears correctly
- But sometimes a different text appears from the top rolling down (unwanted behavior)
- The next text should ONLY slide up from below, not appear from top

### Container Setup
- Parent div: `relative h-[1.5em] overflow-hidden` (fixed height, hides overflow)
- Inner div: `relative` (positioning context for absolute next text)
- Text size: `text-xl md:text-2xl text-gray-600`

## What Needs Fixing
The transition should be:
1. Current text slides up and fades out (working)
2. Next text ONLY slides up from below (not working correctly - sometimes appears from top)
3. No overlap or conflicting animations
4. Smooth, single-direction vertical roll effect

