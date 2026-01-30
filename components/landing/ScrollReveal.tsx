"use client";

import { useRef, useEffect, useState } from "react";

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  style?: React.CSSProperties;
  /** Root margin for Intersection Observer (e.g. "0px 0px -80px 0px" = trigger when 80px from bottom of viewport) */
  rootMargin?: string;
  /** Threshold 0–1; trigger when this fraction of the element is visible */
  threshold?: number;
}

export default function ScrollReveal({
  children,
  className = "",
  id,
  style,
  rootMargin = "0px 0px -60px 0px",
  threshold = 0.1,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setInView(true);
        });
      },
      { rootMargin, threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  return (
    <div
      ref={ref}
      id={id}
      className={`scroll-reveal ${className}`.trim()}
      style={style}
      data-in-view={inView ? "true" : "false"}
    >
      {children}
    </div>
  );
}
