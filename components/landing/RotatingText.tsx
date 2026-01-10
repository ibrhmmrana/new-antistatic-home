"use client";

import { useState, useEffect, useRef } from "react";

const rotatingTexts = [
  "Scan your site and see what isn't working",
  "Find out how to get discovered on Google",
  "See how many reviews you could generate",
  "Compare yourself with your local competition",
];

export default function RotatingText() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef(0);
  const currentIndexRef = useRef(0);

  // Keep ref in sync with state
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    const interval = setInterval(() => {
      animationRef.current += 1;
      const currentIdx = currentIndexRef.current;
      const nextIdx = (currentIdx + 1) % rotatingTexts.length;
      
      setIsAnimating(true);
      
      // Update to next index and reset animation after slide-in completes
      // Slide-in: 300ms delay + 600ms duration = 900ms total
      setTimeout(() => {
        setCurrentIndex(nextIdx);
        setIsAnimating(false);
      }, 900);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const nextIndex = (currentIndex + 1) % rotatingTexts.length;

  return (
    <div className="relative h-[1.5em] overflow-hidden text-xl md:text-2xl text-gray-600 mb-14 max-w-2xl mx-auto">
      <div className="relative h-full">
        {!isAnimating ? (
          // Static display when not animating
          <div key={`static-${currentIndex}`} className="translate-y-0 opacity-100">
            {rotatingTexts[currentIndex]}
          </div>
        ) : (
          // Animation container
          <div key={`anim-${animationRef.current}`}>
            {/* Current text sliding out */}
            <div className="animate-slide-up-out">
              {rotatingTexts[currentIndex]}
            </div>
            {/* Next text sliding in from below - this becomes the new currentIndex */}
            <div className="absolute top-0 left-0 w-full animate-slide-up-in">
              {rotatingTexts[nextIndex]}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
