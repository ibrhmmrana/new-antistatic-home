"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

const HERO_IMAGE_SRC = "/images/hero img.svg";
const HERO_BG_SRC = "/images/background color.svg";

export default function HeroImageGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const [imageReady, setImageReady] = useState(false);

  useEffect(() => {
    // Fallback: show page after 3s if image fails or is slow
    const t = setTimeout(() => setImageReady(true), 3000);
    return () => clearTimeout(t);
  }, []);

  const handleLoad = () => setImageReady(true);

  if (!imageReady) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        <div className="absolute inset-0 z-0">
          <Image
            src={HERO_BG_SRC}
            alt=""
            fill
            className="object-cover"
            priority
          />
        </div>
        {/* Preload hero image (hidden); when loaded we show the page */}
        <Image
          src={HERO_IMAGE_SRC}
          alt=""
          width={800}
          height={600}
          className="absolute opacity-0 pointer-events-none w-0 h-0"
          onLoad={handleLoad}
          priority
        />
      </div>
    );
  }

  return <>{children}</>;
}
