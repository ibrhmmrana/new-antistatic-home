"use client";

import Image from "next/image";
import Link from "next/link";
import { GlitchLogo } from "@/components/GlitchLogo";
import ScrollReveal from "@/components/landing/ScrollReveal";

export default function Footer() {
  return (
    <footer className="relative w-full bg-white pt-6 md:pt-8 lg:pt-10 pb-6 md:pb-8 lg:pb-10">
      <div className="w-full px-6 md:px-8 lg:px-12">
        <div className="max-w-7xl mx-auto space-y-8 md:space-y-10 lg:space-y-12">
          {/* Call-to-action panel */}
          <ScrollReveal className="relative rounded-[32px] overflow-hidden">
            {/* Background image */}
            <div className="absolute inset-0">
              <Image
                src="/images/footer bg.svg"
                alt="Antistatic background"
                fill
                priority={false}
                className="object-cover"
              />
            </div>

            {/* Overlay content */}
            <div className="relative z-10 px-6 md:px-12 lg:px-24 py-16 md:py-20 lg:py-24 flex items-center justify-center text-center">
              <div className="max-w-3xl mx-auto">
                <h2
                  className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6 md:mb-7"
                  style={{ lineHeight: 1.25 }}
                >
                  Antistatic is active reputational
                  <br className="hidden sm:block" />
                  intelligence with rapid response
                </h2>
                <p className="text-base md:text-lg text-white/80 mb-10 md:mb-12">
                  Put a finger on the pulse of your digital reputation.
                  <br className="hidden sm:block" />
                  Action upside within minutes
                </p>

                <div className="flex justify-center">
                  <button
                    className="relative bg-gradient-to-r from-blue-500 to-blue-600 text-white pl-8 pr-16 py-3.5 md:pl-10 md:pr-20 md:py-4 font-medium hover:from-blue-600 hover:to-blue-700 transition-all flex items-center justify-start button-roll-text footer-cta-left"
                    style={{ borderRadius: "50px" }}
                    data-text="Let's Get Started"
                  >
                    <span>Let&apos;s Get Started</span>

                    <div
                      className="absolute right-[1px] top-[1px] bottom-[1px] aspect-square flex items-center justify-center button-icon-rotate"
                      style={{ borderRadius: "9999px" }}
                    >
                      <Image
                        src="/images/arrow icon.svg"
                        alt="Arrow"
                        width={32}
                        height={32}
                        className="flex-shrink-0"
                      />
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </ScrollReveal>

          {/* Bottom row — no scroll animation */}
          <div className="flex flex-col md:flex-row items-center md:items-center justify-between gap-4 md:gap-6">
            {/* Logo */}
            <div className="order-2 md:order-1">
              <GlitchLogo
                src="/images/antistatic logo on white.svg"
                alt="Antistatic"
                className="h-8 w-auto"
              />
            </div>

            {/* Copyright */}
            <div className="text-xs md:text-sm text-gray-500 text-center order-1 md:order-2">
              Copyright © 2026. All rights reserved to Antistatic
            </div>

            {/* Links */}
            <div className="flex items-center gap-4 text-xs md:text-sm text-gray-500 order-3">
              <Link
                href="/privacy"
                className="hover:text-gray-900 transition-colors"
              >
                Privacy Policy
              </Link>
              <span className="text-gray-300">|</span>
              <Link
                href="/terms"
                className="hover:text-gray-900 transition-colors"
              >
                Terms &amp; Conditions
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

