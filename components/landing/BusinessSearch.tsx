"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { debounce } from "@/lib/utils/debounce";
import type { Prediction, SelectedPlace } from "@/lib/types";
import { generateScanId } from "@/lib/report/generateScanId";

interface PlaceDetails {
  name: string;
  rating: number | null;
  address: string;
  photoUrl: string | null;
}

export default function BusinessSearch() {
  const [inputValue, setInputValue] = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  const [placeDetails, setPlaceDetails] = useState<PlaceDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchPredictions = useCallback(async (input: string) => {
    if (input.length < 2) {
      setPredictions([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/places/autocomplete?input=${encodeURIComponent(input)}`
      );
      const data = await response.json();
      setPredictions(data.predictions || []);
      setIsOpen(data.predictions?.length > 0);
      setHighlightedIndex(-1);
    } catch (error) {
      console.error("Error fetching predictions:", error);
      setPredictions([]);
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const debouncedFetch = useCallback(
    debounce((input: string) => {
      fetchPredictions(input);
    }, 250),
    [fetchPredictions]
  );

  useEffect(() => {
    // Don't fetch if we have a selected place (user already selected a business)
    if (selectedPlace && inputValue === selectedPlace.primary_text) {
      return;
    }
    
    if (inputValue.length >= 2) {
      debouncedFetch(inputValue);
    } else {
      setPredictions([]);
      setIsOpen(false);
      setSelectedPlace(null);
      setPlaceDetails(null);
    }
  }, [inputValue, debouncedFetch, selectedPlace]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    // Clear selected place if user is typing something different
    if (selectedPlace && value !== selectedPlace.primary_text) {
      setSelectedPlace(null);
      setPlaceDetails(null);
    }
    if (!value) {
      setSelectedPlace(null);
      setPlaceDetails(null);
    }
  };

  const handleSelect = async (prediction: Prediction) => {
    setSelectedPlace(prediction);
    setInputValue(prediction.primary_text);
    setPredictions([]);
    setIsOpen(false);
    setHighlightedIndex(-1);
    setPlaceDetails(null);
    // Prevent autocomplete from re-opening after selection
    inputRef.current?.blur();

    // Fetch place details
    setIsLoadingDetails(true);
    try {
      const response = await fetch(`/api/places/details?placeId=${encodeURIComponent(prediction.place_id)}`);
      const data = await response.json();
      
      if (response.ok && data) {
        // Get photo URL
        let photoUrl = null;
        if (data.photoRef) {
          photoUrl = `/api/places/photo?ref=${encodeURIComponent(data.photoRef)}&maxw=400`;
        }
        
        setPlaceDetails({
          name: data.name || prediction.primary_text,
          rating: data.rating || null,
          address: data.address || prediction.secondary_text,
          photoUrl,
        });
      }
    } catch (error) {
      console.error("Error fetching place details:", error);
      // Fallback to basic info if API fails
      setPlaceDetails({
      name: prediction.primary_text,
        rating: null,
        address: prediction.secondary_text,
        photoUrl: null,
    });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || predictions.length === 0) {
      // Navigation happens automatically on selection, so no need to handle Enter here
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => {
          const next = prev < predictions.length - 1 ? prev + 1 : prev;
          // Scroll highlighted item into view
          setTimeout(() => {
            const element = document.querySelector(
              `[data-prediction-index="${next}"]`
            );
            if (element) {
              element.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
          }, 0);
          return next;
        });
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => {
          const next = prev > 0 ? prev - 1 : -1;
          // Scroll highlighted item into view
          if (next >= 0) {
            setTimeout(() => {
              const element = document.querySelector(
                `[data-prediction-index="${next}"]`
              );
              if (element) {
                element.scrollIntoView({ block: "nearest", behavior: "smooth" });
              }
            }, 0);
          }
          return next;
        });
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < predictions.length) {
          handleSelect(predictions[highlightedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setHighlightedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const handleGetReport = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!selectedPlace) return;

    // Generate scan ID
    const scanId = generateScanId();
    
    // Navigate immediately - don't wait for anything
    const params = new URLSearchParams({
      placeId: selectedPlace.place_id,
      name: selectedPlace.primary_text,
      addr: selectedPlace.secondary_text,
    });
    router.push(`/report/${scanId}?${params.toString()}`);
    
    // Trigger full social extraction in the background (all strategies: website, GBP, Google CSE)
    // This runs concurrently and results will be prefilled in the modal when ready
    // Don't await - let it run in background
    fetch('/api/scan/socials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: selectedPlace.primary_text,
        address: selectedPlace.secondary_text,
        scanId: `${scanId}_social_extract`, // Use different scanId to avoid conflicts
        websiteUrl: null, // Will be extracted from GBP
      }),
    }).catch((error) => {
      console.error('[SOCIAL EXTRACTION] Failed to trigger extraction:', error);
      // Don't block - extraction failure is non-critical
    });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full max-w-[720px] mx-auto text-left flex flex-col items-start gap-4">
      {/* Search Input Wrapper - relative container for dropdown */}
      <div className="relative inline-block w-full">
        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 z-10">
          {isLoading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <Search className="w-6 h-6" />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (predictions.length > 0) setIsOpen(true);
          }}
          placeholder="Search for your business"
          className="h-16 md:h-20 w-full pl-14 pr-5 rounded-[25px] border border-gray-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder:text-gray-400 text-lg"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="autocomplete-list"
        />

        {/* Autocomplete Dropdown - Owner.com style: compact, left-aligned, native */}
        {isOpen && predictions.length > 0 && (() => {
          // Group predictions by scope (predictions array is already ordered: local first, then global)
          const localResults: Array<{ prediction: typeof predictions[0]; index: number }> = [];
          const globalResults: Array<{ prediction: typeof predictions[0]; index: number }> = [];
          
          predictions.forEach((prediction, index) => {
            if (prediction.scope === "local") {
              localResults.push({ prediction, index });
            } else {
              globalResults.push({ prediction, index });
            }
          });

          const hasLocal = localResults.length > 0;
          const hasGlobal = globalResults.length > 0;

          return (
          <div
            ref={dropdownRef}
            className="absolute left-0 top-[calc(100%+8px)] w-full z-50 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
          >
            <ul className="max-h-[320px] overflow-y-auto py-1">
                {/* Local results section */}
                {hasLocal && localResults.map(({ prediction, index }) => (
                  <li
                    key={prediction.place_id}
                    data-prediction-index={index}
                    role="option"
                    aria-selected={highlightedIndex === index}
                    onClick={() => handleSelect(prediction)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`cursor-pointer px-4 py-3 text-left transition-colors border-b border-gray-100 ${
                      highlightedIndex === index
                        ? "bg-gray-100"
                        : "bg-white hover:bg-gray-50"
                    }`}
                  >
                    <div className="text-[14px] font-medium text-gray-900 leading-5">
                      {prediction.primary_text}
                    </div>
                    {prediction.secondary_text && (
                      <div className="mt-0.5 text-[12px] text-gray-500 leading-4">
                        {prediction.secondary_text}
                      </div>
                    )}
                  </li>
                ))}

                {/* Global results section */}
                {hasGlobal && globalResults.map(({ prediction, index }) => (
                <li
                  key={prediction.place_id}
                  data-prediction-index={index}
                  role="option"
                  aria-selected={highlightedIndex === index}
                  onClick={() => handleSelect(prediction)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`cursor-pointer px-4 py-3 text-left transition-colors border-b border-gray-100 last:border-b-0 ${
                    highlightedIndex === index
                      ? "bg-gray-100"
                      : "bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="text-[14px] font-medium text-gray-900 leading-5">
                    {prediction.primary_text}
                  </div>
                  {prediction.secondary_text && (
                    <div className="mt-0.5 text-[12px] text-gray-500 leading-4">
                      {prediction.secondary_text}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
          );
        })()}
      </div>

      {/* Business Card - Shown when business is selected */}
      {(placeDetails || isLoadingDetails) && (
        <div className="w-full rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {isLoadingDetails ? (
            <div className="p-6 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : placeDetails && (
            <div className="flex flex-col sm:flex-row">
              {/* Business Image */}
              {placeDetails.photoUrl ? (
                <div className="w-full sm:w-48 h-48 sm:h-auto flex-shrink-0">
                  <Image
                    src={placeDetails.photoUrl}
                    alt={placeDetails.name}
                    width={192}
                    height={192}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="w-full sm:w-48 h-48 sm:h-auto flex-shrink-0 bg-gray-100 flex items-center justify-center">
                  <Search className="w-12 h-12 text-gray-400" />
                </div>
              )}
              
              {/* Business Info */}
              <div className="flex-1 p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {placeDetails.name}
                </h3>
                
                {placeDetails.rating !== null && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg font-semibold text-gray-900">
                      {placeDetails.rating.toFixed(1)}
                    </span>
                    <div className="flex items-center">
                      {[...Array(5)].map((_, i) => (
                        <svg
                          key={i}
                          className={`w-5 h-5 ${
                            i < Math.round(placeDetails.rating!)
                              ? "text-yellow-400 fill-current"
                              : "text-gray-300"
                          }`}
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                  </div>
                )}
                
                <p className="text-gray-600 text-sm">
                  {placeDetails.address}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Analyse Button - Below search bar */}
      <button
        onClick={handleGetReport}
        className="h-12 md:h-14 px-8 md:px-10 rounded-[25px] font-medium text-base md:text-lg transition-all flex items-center gap-2 bg-blue-500 text-white hover:bg-blue-600 shadow-md hover:shadow-lg active:scale-95"
        style={{
          cursor: selectedPlace ? 'pointer' : 'not-allowed',
          pointerEvents: selectedPlace ? 'auto' : 'none'
        }}
      >
        <Image
          src="/icons/ai icon.svg"
          alt="AI"
          width={20}
          height={20}
          className="md:w-6 md:h-6 brightness-0 invert"
        />
        <span className="whitespace-nowrap">Analyse my business</span>
      </button>
    </div>
  );
}
