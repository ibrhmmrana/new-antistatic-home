"use client";

import { useState, useEffect, useRef } from "react";
import { X, Mail, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

interface EmailVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: () => void;
  placeId: string;
  placeName: string;
}

export default function EmailVerificationModal({
  isOpen,
  onClose,
  onVerified,
  placeId,
  placeName,
}: EmailVerificationModalProps) {
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
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

      // Wait a moment to show success, then call onVerified
      setTimeout(() => {
        onVerified();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors z-10"
          disabled={loading}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              {success ? (
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              ) : (
                <Mail className="w-8 h-8 text-blue-600" />
              )}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {success ? "Email Verified!" : "Verify Your Email"}
            </h2>
            <p className="text-gray-600 text-sm">
              {success
                ? "Starting your analysis..."
                : stage === "email"
                ? "Enter your email to receive a verification code"
                : "Enter the 6-digit code sent to your email"}
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                  autoFocus
                />
              </div>
              <button
                onClick={handleSendCode}
                disabled={loading || !email}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Code"
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
                      ref={(el) => (inputRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleCodeChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      onPaste={index === 0 ? handlePaste : undefined}
                      className="w-12 h-14 text-center text-xl font-semibold border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
        </div>
      </div>
    </div>
  );
}
