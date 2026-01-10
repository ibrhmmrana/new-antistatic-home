"use client";

import { useState, useEffect } from "react";
import { Loader2, Check, Circle } from "lucide-react";
import StageCompetitorMap from "./StageCompetitorMap";
import StageGoogleBusinessProfile from "./StageGoogleBusinessProfile";
import StageReviewSentiment from "./StageReviewSentiment";
import StagePhotoCollage from "./StagePhotoCollage";
import ScanLineOverlay from "./ScanLineOverlay";

interface ReportScanClientProps {
  scanId: string;
  placeId: string;
  name: string;
  addr: string;
}

interface PlaceDetails {
  website?: string | null;
}

export default function ReportScanClient({
  scanId,
  placeId,
  name,
  addr,
}: ReportScanClientProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [placeDetails, setPlaceDetails] = useState<PlaceDetails | null>(null);

  // Fetch place details on mount
  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const response = await fetch(`/api/places/details?placeId=${encodeURIComponent(placeId)}`);
        if (response.ok) {
          const data = await response.json();
          setPlaceDetails(data);
        }
      } catch (error) {
        console.error("Failed to fetch place details:", error);
      }
    };

    fetchDetails();
  }, [placeId]);

  // Manual navigation handlers - NO automatic progression
  // Steps only change when user clicks Previous/Next buttons or clicks on a step item
  const handleNext = () => {
    if (currentStep < 5) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleStepClick = (stepId: number) => {
    setCurrentStep(stepId);
  };


  // Build step list
  const websiteUrl = placeDetails?.website
    ? (() => {
        try {
          return new URL(placeDetails.website).hostname.replace("www.", "");
        } catch {
          return "Website scan";
        }
      })()
    : "Website scan";

  const steps = [
    { id: 0, label: `${name} & competitors` },
    { id: 1, label: "Google business profile" },
    { id: 2, label: "Google review sentiment" },
    { id: 3, label: "Photo quality and quantity" },
    { id: 4, label: websiteUrl },
    { id: 5, label: "Mobile experience" },
  ];

  const getStepIcon = (stepId: number) => {
    if (stepId < currentStep) {
      // Completed
      return <Check className="w-5 h-5 text-green-600" />;
    } else if (stepId === currentStep) {
      // Current - spinner
      return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
    } else {
      // Upcoming
      return <Circle className="w-5 h-5 text-gray-300" strokeWidth={1.5} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f7f8] flex">
      {/* Left Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-semibold text-gray-900">Scanning…</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <ul className="space-y-2">
            {steps.map((step) => (
              <li
                key={step.id}
                onClick={() => handleStepClick(step.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
                  step.id === currentStep
                    ? "bg-blue-50"
                    : "hover:bg-gray-50"
                }`}
              >
                <div className="flex-shrink-0">{getStepIcon(step.id)}</div>
                <span
                  className={`text-sm ${
                    step.id === currentStep
                      ? "text-gray-900 font-medium"
                      : step.id < currentStep
                      ? "text-gray-700"
                      : "text-gray-600"
                  }`}
                >
                  {step.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Navigation controls */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handlePrevious}
              disabled={currentStep === 0}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentStep === 0
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Previous
            </button>
            <span className="text-xs text-gray-500">
              Step {currentStep + 1} of 6
            </span>
            <button
              onClick={handleNext}
              disabled={currentStep === 5}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentStep === 5
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
            {/* Preview Area */}
            <div className="flex-1 relative overflow-hidden min-h-[600px]">
              {currentStep === 0 ? (
                // Competitors - Real Google Map (Owner.com style - no card wrapper)
                <div className="absolute inset-0">
                  <StageCompetitorMap 
                    placeId={placeId} 
                    name={name}
                    onComplete={() => {
                      // Automatically move to next stage when competitors finish loading
                      if (currentStep === 0) {
                        handleNext();
                      }
                    }}
                  />
                </div>
              ) : currentStep === 1 ? (
                // Google Business Profile step
                <div className="absolute inset-0">
                  <ScanLineOverlay />
                  <StageGoogleBusinessProfile 
                    placeId={placeId}
                    onComplete={() => {
                      // Automatically move to next stage after 4 scans
                      if (currentStep === 1) {
                        handleNext();
                      }
                    }}
                  />
                </div>
              ) : currentStep === 2 ? (
                // Google Review Sentiment step
                <div className="absolute inset-0">
                  <ScanLineOverlay />
                  <StageReviewSentiment 
                    placeId={placeId}
                    onComplete={() => {
                      // Automatically move to next stage after 8.5 seconds
                      if (currentStep === 2) {
                        handleNext();
                      }
                    }}
                  />
                </div>
              ) : currentStep === 3 ? (
                // Photo quality and quantity step
                <div className="absolute inset-0">
                  <ScanLineOverlay />
                  <StagePhotoCollage placeId={placeId} />
                </div>
              ) : (
                <div className="p-6 h-full">
                  <div className="max-w-4xl mx-auto h-full">
                    {currentStep >= 4 && currentStep < 5 && (
                      // Steps 4: Generic placeholder
                      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 h-full flex items-center justify-center">
                        <div className="text-center">
                          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
                          <p className="text-gray-600 text-sm">{steps[currentStep]?.label}</p>
                        </div>
                      </div>
                    )}

                {currentStep === 4 && (
                  // Step 5: Desktop browser frame
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 h-full flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-400" />
                        <div className="w-3 h-3 rounded-full bg-yellow-400" />
                        <div className="w-3 h-3 rounded-full bg-green-400" />
                      </div>
                      <div className="flex-1 h-8 bg-gray-100 rounded-md flex items-center px-3">
                        <div className="w-4 h-4 bg-gray-300 rounded mr-2 animate-pulse" />
                        <div className="flex-1 h-3 bg-gray-200 rounded animate-pulse" />
                      </div>
                    </div>
                    <div className="flex-1 bg-gray-50 rounded-lg border border-gray-200 p-6 space-y-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="space-y-2">
                          <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse" />
                          <div className="h-3 bg-gray-200 rounded w-full animate-pulse" />
                          <div className="h-3 bg-gray-200 rounded w-5/6 animate-pulse" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {currentStep === 5 && (
                  // Step 6: Mobile phone frame
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 h-full flex items-center justify-center">
                    <div className="w-64 h-[500px] bg-gray-900 rounded-[2.5rem] p-2 shadow-2xl">
                      <div className="w-full h-full bg-white rounded-[2rem] overflow-hidden flex flex-col">
                        {/* Phone notch */}
                        <div className="h-8 bg-gray-900 rounded-t-[2rem]" />
                        <div className="flex-1 bg-gray-50 p-4 space-y-3">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="space-y-2">
                              <div className="h-3 bg-gray-200 rounded w-2/3 animate-pulse" />
                              <div className="h-2 bg-gray-200 rounded w-full animate-pulse" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

