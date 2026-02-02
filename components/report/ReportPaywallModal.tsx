"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";

const CARD_STYLE = {
  backgroundColor: "#F2F5FF",
  border: "1px solid #D5E2FF",
  boxShadow: "inset 0 -2px 4px rgba(213, 226, 255, 1)",
};

/** ZA = South Africa (R499/R999); rest of world = $29/$99 */
const isZA = (countryCode: string) => countryCode === "ZA";

type PlanId = "essential" | "full_engine";

interface ReportPaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Paywall modal: pricing plans; Get started creates Stripe Checkout and redirects to payment page.
 * Fetches country from /api/geo/country for country-specific pricing (ZA vs USD).
 */
export default function ReportPaywallModal({ open, onOpenChange }: ReportPaywallModalProps) {
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState<string>("XX");

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/geo/country")
      .then((r) => r.json())
      .then((data: { country?: string }) => setCountryCode(data?.country ?? "XX"))
      .catch(() => setCountryCode("XX"));
  }, [open]);

  const za = isZA(countryCode);
  const essentialPrice = za ? "R499" : "$29";
  const fullEnginePrice = za ? "R999" : "$99";

  const handleGetStarted = async (plan: PlanId) => {
    setError(null);
    setLoadingPlan(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, country: countryCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setLoadingPlan(null);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError("No checkout URL received.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoadingPlan(null);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] backdrop-blur-sm bg-white/5 transition-opacity duration-300 ease-out"
        aria-hidden
        onClick={() => onOpenChange(false)}
      />
      <div
        className="fixed left-1/2 top-1/2 z-[61] w-[calc(100%-2rem)] max-w-4xl max-h-[calc(100vh-3rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
      >
        {/* Header + close */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 id="paywall-title" className="text-lg font-semibold text-gray-900">
            Unlock full report
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pricing cards — same structure as homepage Pricing */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6">
          <p className="text-sm text-gray-600 mb-6 text-center">
            Get the full picture with Antistatic. Choose a plan and get started.
          </p>
          {error && (
            <p className="text-sm text-red-600 mb-4 text-center" role="alert">
              {error}
            </p>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6 max-w-4xl mx-auto">
            {/* Essential Monitoring */}
            <div
              className="rounded-2xl p-6 md:p-8 flex flex-col"
              style={CARD_STYLE}
            >
              <h3 className="text-xl md:text-2xl font-bold mb-1" style={{ color: "#3b82f6" }}>
                Essential Monitoring
              </h3>
              <p className="text-sm text-gray-600 mb-4">Basic features</p>
              <div className="mb-4">
                <span className="text-3xl md:text-4xl font-bold text-gray-900">{essentialPrice}</span>
                <span className="text-sm text-gray-500 ml-2">billed monthly</span>
              </div>
              <div className="mb-4">
                <Image src="/images/seperator.svg" alt="" width={400} height={20} className="w-full h-auto" />
              </div>
              <ul className="space-y-3 mb-6 flex-1">
                <li className="flex items-start gap-2">
                  <Image src="/images/check mark.svg" alt="" width={18} height={18} className="flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-700">24/7 AI reputation monitoring</span>
                </li>
                <li className="flex items-start gap-2">
                  <Image src="/images/check mark.svg" alt="" width={18} height={18} className="flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-700">Competitor radar (up to 2 competitors)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Image src="/images/check mark.svg" alt="" width={18} height={18} className="flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-700">Reputation hub, basic social studio</span>
                </li>
              </ul>
              <button
                type="button"
                onClick={() => handleGetStarted("essential")}
                disabled={!!loadingPlan}
                className="relative w-full inline-flex items-center justify-start bg-gradient-to-r from-blue-500 to-blue-600 text-white pl-6 pr-12 py-2.5 font-medium hover:from-blue-600 hover:to-blue-700 transition-all text-sm button-roll-text button-roll-text-justify-start strip-cta-left disabled:opacity-70 disabled:cursor-not-allowed"
                style={{ borderRadius: "50px" }}
                data-text="Get started"
              >
                <span>{loadingPlan === "essential" ? "Redirecting…" : "Get started"}</span>
                <div
                  className="absolute right-[1px] top-[1px] bottom-[1px] aspect-square flex items-center justify-center button-icon-rotate"
                  style={{ borderRadius: "9999px" }}
                >
                  <Image src="/images/arrow icon.svg" alt="" width={24} height={24} className="flex-shrink-0" />
                </div>
              </button>
            </div>

            {/* Full engine */}
            <div
              className="rounded-2xl p-6 md:p-8 flex flex-col"
              style={CARD_STYLE}
            >
              <h3 className="text-xl md:text-2xl font-bold mb-1" style={{ color: "#3b82f6" }}>
                Full engine
              </h3>
              <p className="text-sm text-gray-600 mb-4">Everything in Essential, plus more</p>
              <div className="mb-4">
                <span className="text-3xl md:text-4xl font-bold text-gray-900">{fullEnginePrice}</span>
                <span className="text-sm text-gray-500 ml-2">billed monthly</span>
              </div>
              <div className="mb-4">
                <Image src="/images/seperator.svg" alt="" width={400} height={20} className="w-full h-auto" />
              </div>
              <ul className="space-y-3 mb-6 flex-1">
                <li className="flex items-start gap-2">
                  <Image src="/images/check mark.svg" alt="" width={18} height={18} className="flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-700">Competitor radar (unlimited)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Image src="/images/check mark.svg" alt="" width={18} height={18} className="flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-700">Creator hub, advanced social studio</span>
                </li>
                <li className="flex items-start gap-2">
                  <Image src="/images/check mark.svg" alt="" width={18} height={18} className="flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-700">Marketplace access, priority support</span>
                </li>
              </ul>
              <button
                type="button"
                onClick={() => handleGetStarted("full_engine")}
                disabled={!!loadingPlan}
                className="relative w-full inline-flex items-center justify-start bg-gradient-to-r from-blue-500 to-blue-600 text-white pl-6 pr-12 py-2.5 font-medium hover:from-blue-600 hover:to-blue-700 transition-all text-sm button-roll-text button-roll-text-justify-start strip-cta-left disabled:opacity-70 disabled:cursor-not-allowed"
                style={{ borderRadius: "50px" }}
                data-text="Get started"
              >
                <span>{loadingPlan === "full_engine" ? "Redirecting…" : "Get started"}</span>
                <div
                  className="absolute right-[1px] top-[1px] bottom-[1px] aspect-square flex items-center justify-center button-icon-rotate"
                  style={{ borderRadius: "9999px" }}
                >
                  <Image src="/images/arrow icon.svg" alt="" width={24} height={24} className="flex-shrink-0" />
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
