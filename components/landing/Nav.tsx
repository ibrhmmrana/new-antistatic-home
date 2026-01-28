"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

export default function Nav() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    // Check initial scroll position
    handleScroll();
    
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav 
      className="sticky top-0 z-20 w-full px-6 py-4 md:px-8 md:py-6 lg:px-12 transition-all duration-500 ease-out"
    >
      <div 
        className={`w-full flex items-center justify-between relative transition-all duration-500 ease-out overflow-hidden ${
          isScrolled ? 'rounded-[50px]' : ''
        }`}
        style={{
          padding: isScrolled ? '1.2rem 2.25rem' : '0',
        }}
      >
        {/* Background image when scrolled */}
        {isScrolled && (
          <div className="absolute inset-0 z-0">
            <Image
              src="/images/background color.svg"
              alt="Background"
              fill
              className="object-cover"
              quality={90}
            />
          </div>
        )}
        
        {/* Content */}
        <div className="relative z-10 w-full flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <Image
            src="/images/antistatic logo on white.svg"
            alt="Antistatic"
            width={120}
            height={40}
            className="h-8 w-auto"
            priority
          />
        </Link>

        {/* Centered Navigation Links */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-8">
          <Link
            href="#product"
            className="text-base text-gray-700 hover:text-blue-500 transition-colors button-roll-text"
            data-text="Product"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('product')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            <span>Product</span>
          </Link>
          <Link
            href="#pricing"
            className="text-base text-gray-700 hover:text-blue-500 transition-colors button-roll-text"
            data-text="Pricing"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            <span>Pricing</span>
          </Link>
          <Link
            href="#insights"
            className="text-base text-gray-700 hover:text-blue-500 transition-colors button-roll-text"
            data-text="Insights"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('insights')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            <span>Insights</span>
          </Link>
        </div>

        {/* Right Side Buttons */}
        <div className="flex items-center gap-6">
          <Link
            href="https://app.antistatic.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-black hover:text-black transition-colors px-4 py-2 border border-black rounded-full hover:border-black button-roll-text"
            data-text="Sign In"
          >
            <span>Sign In</span>
          </Link>
          <Link
            href="#"
            className="text-sm bg-blue-500 text-white px-4 py-2 rounded-full hover:bg-blue-600 transition-colors button-roll-text"
            data-text="Get Started"
          >
            <span>Get Started</span>
          </Link>
        </div>
        </div>
      </div>
    </nav>
  );
}

