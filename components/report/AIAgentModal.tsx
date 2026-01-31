"use client";

import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";

interface AIAgentModalProps {
  stage: number;
  stageName: string;
  /** On mobile only, position the modal lower (e.g. for competitors map stage) */
  moveDownOnMobile?: boolean;
}

// Stage-specific analysis messages
const STAGE_MESSAGES: Record<number, string[]> = {
  0: [
    "Analysing competitor landscape",
    "Mapping local market presence",
    "Identifying ranking opportunities",
    "Calculating market share",
    "Evaluating competitive positioning",
  ],
  1: [
    "Analysing Google Business Profile",
    "Checking profile completeness",
    "Reviewing category optimization",
    "Evaluating keyword usage",
    "Assessing profile strength",
  ],
  2: [
    "Analysing review sentiment",
    "Identifying pain points",
    "Extracting key themes",
    "Calculating sentiment scores",
    "Reviewing customer feedback",
  ],
  3: [
    "Analysing photo quality",
    "Evaluating visual content",
    "Assessing image optimization",
    "Reviewing photo diversity",
    "Calculating visual impact",
  ],
  4: [
    "Scanning online presence",
    "Analysing website performance",
    "Checking social media profiles",
    "Evaluating cross-platform consistency",
    "Compiling comprehensive report",
  ],
};

export default function AIAgentModal({ stage, stageName, moveDownOnMobile }: AIAgentModalProps) {
  const messages = STAGE_MESSAGES[stage] || STAGE_MESSAGES[4];
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % messages.length);
    }, 3000); // Change every 3 seconds (slower rotation)

    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div
      className={`fixed right-6 z-50 animate-fadeIn ${
        moveDownOnMobile ? "top-[28%] md:top-6" : "top-6"
      }`}
    >
      <div className="bg-white/10 backdrop-blur-2xl rounded-xl border border-white/30 shadow-2xl p-4 min-w-[280px] backdrop-saturate-150">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500 rounded-full opacity-20 animate-ping" />
            <div className="relative bg-gradient-to-br from-blue-500 to-purple-600 rounded-full p-2">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-gray-800 uppercase tracking-wide mb-0.5 drop-shadow-sm">
              AI Agent
            </div>
            <div className="text-sm font-medium text-gray-900 truncate drop-shadow-sm">
              {messages[currentMessageIndex]}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
