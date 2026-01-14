# Antistatic Landing Page - Project Brief

## Overview

**Antistatic** is an AI-powered visibility grader that helps businesses understand and improve their online presence. This landing page serves as the entry point where businesses can discover their digital visibility issues and receive an AI-generated report.

**Built by:** Sagentics (South Africa)  
**Tech Stack:** Next.js 14 (App Router), TypeScript, TailwindCSS, Google Maps/Places API  
**Purpose:** Convert visitors into users by providing immediate value through a free AI report

---

## What We've Built

### 1. **Landing Page (Homepage)**

A Google-inspired, minimalist landing page designed to:
- Capture attention with a bold value proposition
- Provide instant business search functionality
- Guide users seamlessly into the report generation flow

**Key Components:**
- **Hero Section**: Large, centered headline ("Your online presence is leaking revenue. Find the leaks with AI.")
- **Rotating Subheadline**: Animated vertical roll showcasing key value propositions:
  - "Scan your site and see what isn't working"
  - "Find out how to get discovered on Google"
  - "See how many reviews you could generate"
  - "Compare yourself with your local competition"
- **Business Search Bar**: 
  - Auto-adjusting width based on input
  - Google Places autocomplete (server-side proxy for security)
  - Integrated "Get my AI report" button with AI icon
  - Owner.com-style dropdown suggestions
- **Background**: Custom TPU-inspired image with full opacity
- **Navigation**: Clean top nav with "Pricing" and "Sign up" (links to app.antistatic.ai)

**Why:** The landing page is the first impression. It needs to be fast, beautiful, and immediately communicate value. The Google-inspired design builds trust, while the rotating subheadline keeps users engaged and highlights different use cases.

---

### 2. **Report Generation Flow**

When a business is selected, users are automatically navigated to a unique report page (`/report/[scanId]`) that simulates an AI scanning process.

**Architecture:**
- **Dynamic Routes**: Each scan gets a unique ID for shareability and tracking
- **Multi-Stage Scanning UI**: Mimics a real-time analysis process
- **Manual Navigation**: Users control progression through stages (Previous/Next buttons + clickable step list)

**Why:** The scanning animation creates anticipation and demonstrates the depth of analysis. Manual navigation gives users control and time to absorb each stage's findings.

---

### 3. **Stage 0: Competitor Map Analysis**

**What it does:**
- Displays an interactive Google Map centered on the selected business
- Finds 3-10 competitors using strict category matching
- Sequentially drops competitor pins with animated badges
- Auto-adjusts map bounds as competitors appear
- Shows typing animation of business name in floating search bar

**Technical Implementation:**
- **Strict Competitor Filtering**: 
  - Same primary category family (restaurant → restaurants/cafes, cinema → cinemas only)
  - Excludes broad container types (malls, schools) unless target is one
  - Radius-fill algorithm (starts at 1.5km, expands to 20km if needed)
  - Prioritizes closest, highest-rated competitors
- **Map Behavior**:
  - Starts at zoom level 17 (close-up view)
  - Minimum zoom clamp at 14 (prevents over-zooming out)
  - Throttled `fitBounds` to prevent jitter
  - Custom business marker (black circle with Google Maps pin icon)
  - Red competitor markers with drop animation
  - Rotating "Competitor" badges (max 3 visible at once)

**Why:** Competitor analysis is the foundation. By showing nearby competitors visually, businesses immediately understand their competitive landscape. The sequential pin drop creates a "scanning" effect that feels alive and thorough.

---

### 4. **Stage 1: Google Business Profile**

**What it does:**
- Displays a GBP-style card with:
  - Primary Google photo + static map image (side-by-side)
  - Business name, rating, review count, category
  - Editorial summary or "No description found" warning
- Animated blue scanning beam overlay (continuous up/down motion)
- Auto-advances after 8.5 seconds

**Why:** Google Business Profile is often the first touchpoint for local customers. Showing this data immediately highlights gaps (missing description, low ratings) and sets context for the review analysis stage.

---

### 5. **Stage 2: Google Review Sentiment**

**What it does:**
- Displays 5 review cards in a "sticker stack" layout:
  - Slightly rotated and overlapping
  - Shows reviewer photo, name, time, rating, review text
  - Local Guide badges (positioned outside avatar with white ring)
  - Variety of ratings (1 low, 1 three-star, 1 four-star, 2 five-star) when available
- Cards scale dynamically to fit viewport (no scrollbars)
- Animated scanning beam overlay continues
- Auto-advances after 8.5 seconds

**Why:** Reviews are social proof. By showing a mix of ratings, businesses see both positive and negative feedback. The sticker stack design is visually engaging and feels like a real review feed.

---

### 6. **Stage 3: Photo Quality and Quantity**

**What it does:**
- Displays a collage of 12-18 Google Business Profile photos
- Photos appear one-by-one with smooth animations (opacity + scale + rise)
- Polaroid-style frames (white border, rounded corners, soft shadow)
- Deterministic layout (same business = same positions/rotations)
- Back-to-front reveal order (lowest z-index first)
- Waits for each image to load before revealing next

**Why:** Photos are critical for local businesses. A sparse or low-quality photo gallery signals missed opportunities. The polaroid collage is visually striking and immediately shows photo quantity/quality gaps.

---

### 7. **Legal Pages**

**Pages:**
- **Privacy Policy** (`/privacy`)
- **Terms of Service** (`/terms`)
- **Data Deletion Instructions** (`/data-deletion`)

**Design:**
- Matches homepage aesthetic (same background image, Nav component)
- Content displayed in styled cards with backdrop blur
- Sticky footer links on homepage (bottom left, horizontal layout)

**Why:** Legal compliance is essential, especially for B2B SaaS. These pages protect the business legally and build trust with privacy-conscious users. The consistent design ensures they don't feel like an afterthought.

---

## Technical Architecture

### **API Routes (Server-Side Proxies)**

All Google API calls are proxied through Next.js API routes to:
- Keep API keys secure (never exposed to client)
- Add caching headers (reduce quota usage)
- Normalize responses (consistent data structure)
- Add error handling and validation

**Routes:**
- `/api/places/autocomplete` - Business search suggestions
- `/api/places/details` - Full business details
- `/api/places/competitors` - Competitor discovery with strict filtering
- `/api/places/reviews` - Review fetching with variety selection
- `/api/places/photos` - Photo reference list
- `/api/places/photo` - Photo image streaming (with caching)
- `/api/places/static-map` - Static map image generation

**Why:** Security and performance. Server-side proxies prevent API key exposure, enable caching, and provide a consistent interface for the frontend.

---

### **Design System**

**Typography:**
- **Product Sans** (custom font) for hero text and all UI
- Loaded via `next/font/local` for optimal performance

**Colors:**
- Very light gray background (`#f6f7f8`)
- Black/dark gray for primary text
- Blue accents for CTAs and interactive elements
- White cards with subtle borders and shadows

**Animations:**
- Smooth transitions (250ms debounce for search)
- CSS keyframes for rotating text, scan beam, photo reveals
- Respects `prefers-reduced-motion`

**Why:** Consistency and performance. A cohesive design system makes the product feel polished, while optimized animations keep the experience smooth.

---

### **Key Technical Decisions**

1. **Next.js 14 App Router**: Modern routing, server components, and built-in optimizations
2. **TypeScript**: Type safety for API responses and component props
3. **TailwindCSS**: Rapid UI development with consistent spacing/colors
4. **Server-Side API Proxies**: Security and caching
5. **Deterministic Layouts**: Fixed templates for photos/reviews ensure consistent rendering
6. **Manual Stage Navigation**: User control over report progression
7. **Sequential Animations**: Creates a "scanning" effect that feels thorough

---

## Why These Features Matter

### **For Users (Businesses)**
- **Immediate Value**: Free report without signup creates trust
- **Visual Understanding**: Maps and collages make data digestible
- **Actionable Insights**: Each stage highlights specific gaps (missing photos, low ratings, etc.)
- **Professional Presentation**: Polished UI builds confidence in the product

### **For the Business (Antistatic)**
- **Lead Generation**: Email capture opportunity (future enhancement)
- **Product Demo**: Shows depth of analysis without requiring full product access
- **Shareability**: Unique scan IDs enable viral sharing
- **Conversion**: Engaging experience increases signup likelihood

---

## Current Status

✅ **Completed:**
- Landing page with Google Places autocomplete
- Multi-stage report UI with 4 stages
- Competitor map with strict filtering
- Google Business Profile display
- Review sentiment visualization
- Photo collage with animations
- Legal pages (Privacy, Terms, Data Deletion)
- Responsive design
- Custom fonts and branding

🚧 **Future Enhancements (Not Yet Implemented):**
- Website scanning (Stage 4)
- Mobile experience analysis (Stage 5)
- Email capture for report delivery
- Social sharing functionality
- Report PDF export
- User accounts and saved reports

---

## Environment Variables Required

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GOOGLE_PLACES_API_KEY=...
GOOGLE_MAPS_API_KEY=...
GBP_CLIENT_ID=...
GBP_CLIENT_SECRET=...
GBP_REDIRECT_URI=...
```

---

## Deployment

- **Platform**: Vercel (recommended for Next.js)
- **Build**: `npm run build` (verified working)
- **Domain**: Configured for production deployment

---

## Summary

This landing page is a **conversion-focused, value-first experience** that demonstrates Antistatic's AI capabilities through an engaging, multi-stage report. By providing immediate value (free report) and showcasing the depth of analysis, it builds trust and drives signups to the main application.

The technical architecture prioritizes **security** (server-side API proxies), **performance** (caching, optimized images), and **user experience** (smooth animations, responsive design, accessible UI).


