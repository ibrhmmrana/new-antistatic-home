# Public Assets Directory

This directory contains static assets that are served at the root URL.

## Directory Structure

```
public/
├── fonts/          # Custom font files (.woff, .woff2, .ttf, .otf)
├── images/         # Image files (.png, .jpg, .svg, .webp)
└── icons/          # Icon files (.svg, .png)
```

## Usage

### Images
Place images in `public/images/` and reference them like:
```tsx
<Image src="/images/logo.png" alt="Logo" width={200} height={200} />
// or
<img src="/images/hero-bg.jpg" alt="Background" />
```

### Fonts
Place font files in `public/fonts/` and use them via CSS:
```css
@font-face {
  font-family: 'CustomFont';
  src: url('/fonts/custom-font.woff2') format('woff2');
}
```

Or use Next.js font loader in `app/layout.tsx`:
```tsx
import localFont from 'next/font/local'

const customFont = localFont({
  src: './fonts/custom-font.woff2',
  variable: '--font-custom',
})
```

### Icons
Place icons in `public/icons/` and reference them:
```tsx
<img src="/icons/icon.svg" alt="Icon" />
```

## Notes

- Files in `public/` are served statically and accessible at the root URL
- Use Next.js `Image` component for optimized images
- For fonts, prefer `next/font/local` for better performance


