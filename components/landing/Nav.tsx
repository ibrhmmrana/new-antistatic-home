"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { GlitchLogo } from "@/components/GlitchLogo";

const SCROLL_ENTER_PX = 24;
const SCROLL_LEAVE_PX = 10;

const navLinks = [
  { href: "#product", label: "Product" },
  { href: "#pricing", label: "Pricing" },
  { href: "#insights", label: "Insights" },
  { href: "#contact", label: "Contact us" },
];

export default function Nav() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rafIdRef = useRef<number | null>(null);
  const lastValueRef = useRef(false);

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    const updateScrolled = () => {
      const y = window.scrollY;
      const next =
        lastValueRef.current
          ? y > SCROLL_LEAVE_PX
          : y > SCROLL_ENTER_PX;
      if (next !== lastValueRef.current) {
        lastValueRef.current = next;
        setIsScrolled(next);
      }
      rafIdRef.current = null;
    };

    const handleScroll = () => {
      if (rafIdRef.current !== null) return;
      rafIdRef.current = requestAnimationFrame(updateScrolled);
    };

    lastValueRef.current = window.scrollY > SCROLL_ENTER_PX;
    setIsScrolled(lastValueRef.current);

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafIdRef.current !== null)
        cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  return (
    <nav
      data-scrolled={isScrolled ? "true" : "false"}
      className="sticky top-0 z-20 w-full px-6 md:px-8 lg:px-12 animate-hero-header-in landing-nav-root"
    >
      <div className="landing-nav-shell">
        <div
          data-scrolled={isScrolled ? "true" : "false"}
          className="landing-nav-pill w-full flex items-center justify-between relative overflow-visible"
        >
          {/* Content */}
          <div className="relative z-10 w-full flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center">
              <GlitchLogo
                src="/images/antistatic logo on white.svg"
                alt="Antistatic"
                className="h-8 w-auto"
              />
            </Link>

            {/* Desktop: Centered Navigation Links */}
            <div className="absolute left-1/2 -translate-x-1/2 hidden lg:flex items-center gap-8">
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="text-base text-gray-700 hover:text-blue-500 transition-colors button-roll-text"
                  data-text={label}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  <span>{label}</span>
                </Link>
              ))}
            </div>

            {/* Desktop: Right Side Buttons */}
            <div className="hidden lg:flex items-center gap-3">
              <Link
                href="https://app.antistatic.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-black hover:text-black transition-colors px-4 py-2 border border-black rounded-full hover:border-black button-roll-text text-center min-w-[7.5rem]"
                data-text="Sign In"
              >
                <span>Sign In</span>
              </Link>
              <Link
                href="#"
                className="text-sm bg-blue-500 text-white px-4 py-2 rounded-full hover:bg-blue-600 transition-colors button-roll-text text-center min-w-[7.5rem]"
                data-text="Get Started"
              >
                <span>Get Started</span>
              </Link>
            </div>

            {/* Mobile/Tablet: Hamburger */}
            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              className="lg:hidden p-2 -m-2 text-gray-700 hover:text-blue-500 transition-colors"
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile/Tablet: Dropdown menu */}
        <div
          aria-hidden={!menuOpen}
          className={`lg:hidden absolute left-4 right-4 top-full z-30 mt-1 rounded-2xl bg-white shadow-lg border border-gray-100 overflow-hidden transition-all duration-200 ease-out ${
            menuOpen ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
          }`}
          style={{ maxHeight: menuOpen ? "80vh" : "0" }}
        >
          <div className="px-4 py-4 flex flex-col gap-1">
            {navLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="text-base text-gray-700 hover:text-blue-500 hover:bg-gray-50 px-4 py-3 rounded-xl transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  closeMenu();
                  document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {label}
              </Link>
            ))}
            <div className="border-t border-gray-100 mt-2 pt-3 flex flex-col gap-2">
              <Link
                href="https://app.antistatic.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-center text-sm text-black px-4 py-3 border border-black rounded-full hover:bg-gray-50 transition-colors"
                onClick={closeMenu}
              >
                Sign In
              </Link>
              <Link
                href="#"
                className="text-center text-sm bg-blue-500 text-white px-4 py-3 rounded-full hover:bg-blue-600 transition-colors"
                onClick={closeMenu}
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

