"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { X } from "lucide-react";

const CARD_STYLE = {
  backgroundColor: "#F2F5FF",
  border: "1px solid #D5E2FF",
  boxShadow: "inset 0 -2px 4px rgba(213, 226, 255, 1)",
};

/** ZA = South Africa (R499/R999); rest of world = $29/$99. Compare = before discount. */
const isZA = (countryCode: string) => countryCode === "ZA";

type PlanId = "essential" | "full_engine";

interface ReportPaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scanId?: string;
  placeId?: string;
  reportId?: string;
  /** Business name for email verification challenge (stored with OTP request) */
  businessName?: string | null;
}

/**
 * Paywall modal: pricing plans; Get started creates Stripe Checkout and redirects to payment page.
 * If user is not email-verified (401), shows inline email + OTP verification so they can proceed.
 */
export default function ReportPaywallModal({ open, onOpenChange, scanId, placeId, reportId, businessName }: ReportPaywallModalProps) {
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState<string>("XX");
  const [geoLoading, setGeoLoading] = useState(true);

  // Inline email verification when checkout returns EMAIL_NOT_VERIFIED
  const [showVerification, setShowVerification] = useState(false);
  const pendingPlanRef = useRef<PlanId | null>(null);
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyStage, setVerifyStage] = useState<"email" | "code">("email");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) {
      setShowVerification(false);
      setVerifyStage("email");
      setChallengeId(null);
      setVerifyEmail("");
      setVerifyCode("");
      setVerifyError(null);
      pendingPlanRef.current = null;
      return;
    }
    setGeoLoading(true);
    fetch("/api/geo/country")
      .then((r) => r.json())
      .then((data: { country?: string }) => setCountryCode(data?.country ?? "XX"))
      .catch(() => setCountryCode("XX"))
      .finally(() => setGeoLoading(false));
  }, [open]);

  const za = isZA(countryCode);
  const essentialPrice = za ? "R499" : "$29";
  const fullEnginePrice = za ? "R999" : "$99";
  const essentialCompare = za ? "R999" : "$49";
  const fullEngineCompare = za ? "R1,499" : "$149";
  const essentialSave = za ? "50%" : "41%";
  const fullEngineSave = za ? "33%" : "34%";

  const runCheckout = async (plan: PlanId) => {
    setError(null);
    setLoadingPlan(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan, country: countryCode, scanId, placeId, reportId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 && data.error === "EMAIL_NOT_VERIFIED") {
          pendingPlanRef.current = plan;
          setShowVerification(true);
          setError(null);
        } else {
          setError(data.error || "Something went wrong. Please try again.");
        }
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

  const handleGetStarted = (plan: PlanId) => {
    pendingPlanRef.current = plan;
    runCheckout(plan);
  };

  const handleSendCode = async () => {
    const email = verifyEmail.trim();
    if (!email || !email.includes("@")) {
      setVerifyError("Please enter a valid email address.");
      return;
    }
    setVerifyError(null);
    setVerifyLoading(true);
    try {
      const res = await fetch("/api/public/verify-email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          placeId,
          placeName: (businessName && String(businessName).trim()) || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setVerifyError(data.error || "Failed to send code. Please try again.");
        return;
      }
      setChallengeId(data.challengeId);
      setVerifyStage("code");
      setVerifyCode("");
    } catch {
      setVerifyError("Something went wrong. Please try again.");
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleConfirmCode = async () => {
    const code = verifyCode.trim();
    if (!challengeId || code.length !== 4) {
      setVerifyError("Please enter the 4-digit code from your email.");
      return;
    }
    setVerifyError(null);
    setVerifyLoading(true);
    try {
      const res = await fetch("/api/public/verify-email/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ challengeId, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setVerifyError(data.error || "Invalid code. Please try again.");
        return;
      }
      setShowVerification(false);
      setVerifyStage("email");
      setChallengeId(null);
      setVerifyEmail("");
      setVerifyCode("");
      const plan = pendingPlanRef.current;
      pendingPlanRef.current = null;
      if (plan) runCheckout(plan);
    } catch {
      setVerifyError("Something went wrong. Please try again.");
    } finally {
      setVerifyLoading(false);
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
          {showVerification ? (
            <div className="max-w-sm mx-auto mb-6 p-5 rounded-xl border border-gray-200 bg-gray-50">
              <h3 className="text-base font-semibold text-gray-900 mb-1">Verify your email to continue</h3>
              <p className="text-sm text-gray-600 mb-4">
                {verifyStage === "email"
                  ? "Enter your email and we'll send you a one-time code."
                  : "Enter the 4-digit code we sent to your email."}
              </p>
              {verifyError && (
                <p className="text-sm text-red-600 mb-3" role="alert">
                  {verifyError}
                </p>
              )}
              {verifyStage === "email" ? (
                <div className="space-y-3">
                  <input
                    type="email"
                    value={verifyEmail}
                    onChange={(e) => setVerifyEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={verifyLoading}
                  />
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={verifyLoading}
                    className="w-full py-2.5 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {verifyLoading ? "Sending…" : "Send verification code"}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="0000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={verifyLoading}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setVerifyStage("email"); setVerifyError(null); setVerifyCode(""); setChallengeId(null); }}
                      className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmCode}
                      disabled={verifyLoading || verifyCode.length !== 4}
                      className="flex-1 py-2.5 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {verifyLoading ? "Verifying…" : "Verify"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
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
                {geoLoading ? (
                  <div className="flex items-baseline gap-2">
                    <span className="inline-block h-9 md:h-10 w-20 rounded bg-gray-200 animate-pulse" aria-hidden />
                    <span className="text-sm text-gray-500 ml-2">billed monthly</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm md:text-base text-gray-400 line-through decoration-gray-400/70">{essentialCompare}</span>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium tracking-wide uppercase text-gray-600"
                        style={{ backgroundColor: "#E8EDFA", border: "1px solid #C5D4F0", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)" }}
                      >
                        Save {essentialSave}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl md:text-4xl font-bold text-gray-900">{essentialPrice}</span>
                      <span className="text-sm text-gray-500">/month</span>
                    </div>
                  </>
                )}
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
                data-text="Start 14 day free trial"
              >
                <span>{loadingPlan === "essential" ? "Redirecting…" : "Start 14 day free trial"}</span>
                <div
                  className="absolute right-[1px] top-[1px] bottom-[1px] aspect-square flex items-center justify-center button-icon-rotate"
                  style={{ borderRadius: "9999px" }}
                >
                  <Image src="/images/arrow icon.svg" alt="" width={24} height={24} className="flex-shrink-0" />
                </div>
              </button>
            </div>

            {/* Full Engine */}
            <div
              className="rounded-2xl p-6 md:p-8 flex flex-col"
              style={CARD_STYLE}
            >
              <h3 className="text-xl md:text-2xl font-bold mb-1" style={{ color: "#3b82f6" }}>
                Full Engine
              </h3>
              <p className="text-sm text-gray-600 mb-4">Everything in Essential, plus more</p>
              <div className="mb-4">
                {geoLoading ? (
                  <div className="flex items-baseline gap-2">
                    <span className="inline-block h-9 md:h-10 w-20 rounded bg-gray-200 animate-pulse" aria-hidden />
                    <span className="text-sm text-gray-500 ml-2">billed monthly</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm md:text-base text-gray-400 line-through decoration-gray-400/70">{fullEngineCompare}</span>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium tracking-wide uppercase text-gray-600"
                        style={{ backgroundColor: "#E8EDFA", border: "1px solid #C5D4F0", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)" }}
                      >
                        Save {fullEngineSave}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl md:text-4xl font-bold text-gray-900">{fullEnginePrice}</span>
                      <span className="text-sm text-gray-500">/month</span>
                    </div>
                  </>
                )}
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
                data-text="Start 14 day free trial"
              >
                <span>{loadingPlan === "full_engine" ? "Redirecting…" : "Start 14 day free trial"}</span>
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
