import type { Metadata } from "next";
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
    icon: "/icons/Antistatic-favicon.png",
    shortcut: "/icons/Antistatic-favicon.png",
    apple: "/icons/Antistatic-favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={productSans.variable}>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}

