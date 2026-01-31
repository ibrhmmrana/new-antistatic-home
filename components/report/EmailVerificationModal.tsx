"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { X, Mail, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

interface EmailVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: (socialUsernames?: { instagram?: string; facebook?: string }, email?: string) => void;
  placeId: string;
  placeName: string;
  prefilledUsernames?: { instagram?: string; facebook?: string };
}

export default function EmailVerificationModal({
  isOpen,
  onClose,
  onVerified,
  placeId,
  placeName,
  prefilledUsernames,
}: EmailVerificationModalProps) {
  const router = useRouter();
  // Always start with usernames step, regardless of whether usernames were found
  const [carouselStep, setCarouselStep] = useState<"usernames" | "verification">("usernames");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [instagramUsername, setInstagramUsername] = useState(prefilledUsernames?.instagram || "");
  const [facebookUsername, setFacebookUsername] = useState(prefilledUsernames?.facebook || "");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendDisabled, setResendDisabled] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [success, setSuccess] = useState(false);
  
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer for resend
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setResendDisabled(false);
    }
  }, [resendCountdown]);

  // Auto-focus first code input when stage changes
  useEffect(() => {
    if (stage === "code" && inputRefs.current[0]) {
      inputRefs.current[0]?.focus();
    }
  }, [stage]);

  // Update usernames when prefilledUsernames change (extraction completes in background)
  useEffect(() => {
    if (prefilledUsernames) {
      // Always update if prefilled usernames are provided
      // This allows the modal to update immediately when extraction completes
      if (prefilledUsernames.instagram) {
        setInstagramUsername(prefilledUsernames.instagram);
        console.log('[MODAL] Updated Instagram username from prefilled:', prefilledUsernames.instagram);
      }
      if (prefilledUsernames.facebook) {
        setFacebookUsername(prefilledUsernames.facebook);
        console.log('[MODAL] Updated Facebook username from prefilled:', prefilledUsernames.facebook);
      }
    }
  }, [prefilledUsernames]);

  const handleSendCode = async () => {
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/public/verify-email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          placeId,
          placeName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send verification code");
      }

      setChallengeId(data.challengeId);
      setStage("code");
      setResendDisabled(true);
      setResendCountdown(data.resendAfterSeconds || 30);
    } catch (err: any) {
      setError(err.message || "Failed to send verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendDisabled) return;
    await handleSendCode();
  };

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Only digits

    const newCode = [...code];
    newCode[index] = value.slice(-1); // Only last character
    setCode(newCode);
    setError(null);

    // Auto-advance to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits are entered
    if (newCode.every((digit) => digit !== "") && newCode.join("").length === 6) {
      handleVerifyCode(newCode.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").slice(0, 6).replace(/\D/g, "");
    if (pasted.length === 6) {
      const newCode = pasted.split("");
      setCode(newCode);
      inputRefs.current[5]?.focus();
      handleVerifyCode(pasted);
    }
  };

  const handleVerifyCode = async (codeToVerify?: string) => {
    const codeString = codeToVerify || code.join("");
    
    if (codeString.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }

    if (!challengeId) {
      setError("No verification challenge found. Please request a new code.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/public/verify-email/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          code: codeString,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Invalid verification code");
      }

      setSuccess(true);
      
      // Store proof token in sessionStorage as fallback
      if (data.proofToken) {
        sessionStorage.setItem(`email_verified_${placeId}`, data.proofToken);
      }

      // Prepare social usernames (clean them up - remove @ and whitespace)
      // Use whatever is in the fields
      const cleanInstagram = instagramUsername.trim().replace(/^@+/, '');
      const cleanFacebook = facebookUsername.trim().replace(/^@+/, '');
      
      const socialUsernames: { instagram?: string; facebook?: string } = {};
      if (cleanInstagram) socialUsernames.instagram = cleanInstagram;
      if (cleanFacebook) socialUsernames.facebook = cleanFacebook;

      // Wait a moment to show success, then call onVerified with usernames and verified email
      setTimeout(() => {
        onVerified(
          Object.keys(socialUsernames).length > 0 ? socialUsernames : undefined,
          email.trim()
        );
      }, 500);
    } catch (err: any) {
      setError(err.message || "Invalid verification code. Please try again.");
      // Clear code on error
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" style={{ boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
        {/* Close button */}
        <button
          onClick={() => {
            router.push("/");
          }}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors z-10"
          disabled={loading}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8">
          {/* Carousel Step 1: Username Confirmation */}
          {carouselStep === "usernames" && (
            <>
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {prefilledUsernames && (prefilledUsernames.instagram || prefilledUsernames.facebook)
                    ? "Is this correct?"
                    : "Social Media Profiles"}
                </h2>
                <p className="text-gray-600 text-sm">
                  {prefilledUsernames && (prefilledUsernames.instagram || prefilledUsernames.facebook)
                    ? "We found these social media profiles for your business. Please confirm or edit them."
                    : "Add your social media usernames for faster analysis (optional)."}
                </p>
              </div>

              {/* Error message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="space-y-4">
                {/* Instagram */}
                <div>
                  <label htmlFor="instagram-username" className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <defs>
                        <linearGradient id="instagram-gradient-modal" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#f09433" />
                          <stop offset="25%" stopColor="#e6683c" />
                          <stop offset="50%" stopColor="#dc2743" />
                          <stop offset="75%" stopColor="#cc2366" />
                          <stop offset="100%" stopColor="#bc1888" />
                        </linearGradient>
                      </defs>
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" fill="url(#instagram-gradient-modal)"/>
                    </svg>
                    Instagram Username
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      @
                    </div>
                    <input
                      id="instagram-username"
                      type="text"
                      value={instagramUsername}
                      onChange={(e) => {
                        const value = e.target.value.replace(/^@+/, '');
                        setInstagramUsername(value);
                      }}
                      placeholder="username"
                      className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={loading}
                    />
                  </div>
                </div>

                {/* Facebook */}
                <div>
                  <label htmlFor="facebook-username" className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#1877F2">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                    Facebook Username
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      @
                    </div>
                    <input
                      id="facebook-username"
                      type="text"
                      value={facebookUsername}
                      onChange={(e) => {
                        const value = e.target.value.replace(/^@+/, '');
                        setFacebookUsername(value);
                      }}
                      placeholder="username"
                      className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={loading}
                    />
                  </div>
                </div>

                {/* Continue button */}
                <button
                  onClick={() => {
                    setError(null);
                    setCarouselStep("verification");
                  }}
                  className="relative w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 button-roll-text button-roll-text-with-icon"
                  data-text="Continue"
                  disabled={loading}
                >
                  <span>Continue</span>
                  <Image
                    src="/images/arrow icon.svg"
                    alt="Arrow"
                    width={20}
                    height={20}
                    className="flex-shrink-0 button-icon-rotate"
                  />
                </button>
              </div>
            </>
          )}

          {/* Carousel Step 2: Email Verification */}
          {carouselStep === "verification" && (
            <>
              {/* Header */}
              <div className="text-center mb-6 relative">
                {/* Back button */}
                {prefilledUsernames && (prefilledUsernames.instagram || prefilledUsernames.facebook) && (
                  <button
                    onClick={() => {
                      setCarouselStep("usernames");
                      setError(null);
                    }}
                    className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    disabled={loading}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                )}
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                  {success ? (
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  ) : (
                    <Mail className="w-8 h-8 text-blue-600" />
                  )}
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {success ? "Email Verified!" : "Unlock your free report"}
                </h2>
                <p className="text-gray-600 text-sm">
                  {success
                    ? "Starting your analysis..."
                    : "Verify your email to see why your competitors are beating you on Google."}
                </p>
              </div>

              {/* Error message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Email stage */}
              {stage === "email" && !success && (
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSendCode();
                  }}
                  placeholder="your@email.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                  autoFocus
                />
              </div>


              <button
                onClick={handleSendCode}
                disabled={loading || !email}
                className={`relative w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${loading ? '' : 'button-roll-text button-roll-text-with-icon'}`}
                data-text="Send Code"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <span>Send Code</span>
                    <Image
                      src="/images/arrow icon.svg"
                      alt="Arrow"
                      width={20}
                      height={20}
                      className="flex-shrink-0 button-icon-rotate"
                    />
                  </>
                )}
              </button>
            </div>
          )}

              {/* Code stage */}
              {stage === "code" && !success && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3 text-center">
                  Enter verification code
                </label>
                <div className="flex gap-2 justify-center">
                  {code.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        inputRefs.current[index] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleCodeChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      onPaste={index === 0 ? handlePaste : undefined}
                      className="w-12 h-14 text-center text-xl font-semibold text-gray-900 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={loading}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <button
                  onClick={handleResendCode}
                  disabled={resendDisabled || loading}
                  className="text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {resendCountdown > 0 ? `Resend code in ${resendCountdown}s` : "Resend code"}
                </button>
                <button
                  onClick={() => {
                    setStage("email");
                    setCode(["", "", "", "", "", ""]);
                    setError(null);
                  }}
                  className="text-gray-600 hover:text-gray-700 transition-colors"
                  disabled={loading}
                >
                  Change email
                </button>
              </div>

              <button
                onClick={() => handleVerifyCode()}
                disabled={loading || code.some((digit) => !digit)}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify"
                )}
              </button>
            </div>
          )}

              {/* Success state */}
              {success && (
                <div className="text-center py-4">
                  <p className="text-gray-600">Redirecting to analysis...</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
