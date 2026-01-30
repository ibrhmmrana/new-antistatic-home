"use client";

import React, { useEffect, useMemo, useState } from "react";

type GlitchLogoProps = {
  src: string;
  alt?: string;
  className?: string;
  burstMs?: number;
  minGapMs?: number;
  maxGapMs?: number;
};

export function GlitchLogo({
  src,
  alt = "Logo",
  className = "",
  burstMs = 280,
  minGapMs = 3000,
  maxGapMs = 5000,
}: GlitchLogoProps) {
  const [glitchOn, setGlitchOn] = useState(false);
  const instanceId = useMemo(() => Math.random().toString(36).slice(2), []);
  const wrapId = `glitch-${instanceId}`;

  useEffect(() => {
    let alive = true;
    let t: ReturnType<typeof setTimeout> | undefined;

    const rand = (a: number, b: number) =>
      Math.floor(a + Math.random() * (b - a));

    const schedule = () => {
      const wait = rand(minGapMs, maxGapMs);
      t = window.setTimeout(() => {
        if (!alive) return;
        setGlitchOn(true);
        window.setTimeout(() => {
          if (!alive) return;
          setGlitchOn(false);
          schedule();
        }, burstMs);
      }, wait);
    };

    schedule();
    return () => {
      alive = false;
      if (t) window.clearTimeout(t);
    };
  }, [burstMs, minGapMs, maxGapMs]);

  return (
    <span id={wrapId} className={`relative inline-block ${className}`}>
      <img
        src={src}
        alt={alt}
        className="block h-8 w-auto select-none"
        draggable={false}
      />

      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 glitch-overlay transition-opacity duration-75 ${
          glitchOn ? "opacity-100" : "opacity-0"
        }`}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-auto select-none mix-blend-screen"
          style={{
            filter: "drop-shadow(5px 0 0 rgba(255,0,100,1)) drop-shadow(-1px 2px 0 rgba(0,255,255,0.8))",
            transform: "translate(5px, -3px) skewX(-14deg)",
            clipPath: "var(--clip-a)",
          }}
        />
        <img
          src={src}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-auto select-none mix-blend-screen"
          style={{
            filter: "drop-shadow(-5px 0 0 rgba(0,255,255,1)) drop-shadow(1px -2px 0 rgba(255,0,100,0.8))",
            transform: "translate(-5px, 3px) skewX(14deg)",
            clipPath: "var(--clip-b)",
          }}
        />
        <span className="absolute inset-0 glitch-slices" />
      </span>

      <style jsx>{`
        #${wrapId} {
          --clip-a: inset(0 0 0 0);
          --clip-b: inset(0 0 0 0);
        }

        #${wrapId} .glitch-overlay {
          animation: ${glitchOn ? `glitchSlices${instanceId} ${burstMs}ms steps(1, end) infinite` : "none"};
        }

        @keyframes glitchSlices${instanceId} {
          0% {
            --clip-a: inset(0% 0 85% 0);
            --clip-b: inset(25% 0 55% 0);
          }
          12% {
            --clip-a: inset(60% 0 15% 0);
            --clip-b: inset(8% 0 80% 0);
          }
          25% {
            --clip-a: inset(15% 0 70% 0);
            --clip-b: inset(75% 0 5% 0);
          }
          37% {
            --clip-a: inset(45% 0 35% 0);
            --clip-b: inset(35% 0 45% 0);
          }
          50% {
            --clip-a: inset(5% 0 82% 0);
            --clip-b: inset(65% 0 22% 0);
          }
          62% {
            --clip-a: inset(70% 0 18% 0);
            --clip-b: inset(12% 0 75% 0);
          }
          75% {
            --clip-a: inset(28% 0 58% 0);
            --clip-b: inset(52% 0 30% 0);
          }
          87% {
            --clip-a: inset(38% 0 48% 0);
            --clip-b: inset(18% 0 68% 0);
          }
          100% {
            --clip-a: inset(0 0 0 0);
            --clip-b: inset(0 0 0 0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          #${wrapId} .glitch-overlay {
            animation: none !important;
          }
        }
      `}</style>
    </span>
  );
}
