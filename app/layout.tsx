import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import "./globals.css";

const productSans = localFont({
  src: [
    {
      path: "../fonts/product-sans/ProductSans-Thin.ttf",
      weight: "100",
      style: "normal",
    },
    {
      path: "../fonts/product-sans/ProductSans-Light.ttf",
      weight: "300",
      style: "normal",
    },
    {
      path: "../fonts/product-sans/ProductSans-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/product-sans/ProductSans-Medium.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../fonts/product-sans/ProductSans-Bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-product-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Antistatic — AI Visibility Grader",
  description: "Get a free AI report on your Google presence, reviews, and website experience",
  icons: {
    icon: "/images/favicon.svg",
    shortcut: "/images/favicon.svg",
    apple: "/images/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={productSans.variable} style={{ scrollBehavior: 'smooth' }}>
      <body className={`${productSans.className} antialiased`}>
        {children}

        {/* SnipForm wrap: form UI. Load first. */}
        <Script
          src="https://cdn.snipform.io/wrap/sf.iife.js"
          strategy="afterInteractive"
        />

        {/* SnipForm Signals: analytics. lazyOnload = after page interactive, avoids React 19 script hoisting breaking document.currentScript on homepage. */}
        <Script
          src="https://cdn.snipform.io/api/analytics/beta.signals.js?site=6983927d79a626061c00aff2"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
