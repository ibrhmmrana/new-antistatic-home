"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { debounce } from "@/lib/utils/debounce";
import type { Prediction, SelectedPlace } from "@/lib/types";
import { generateScanId } from "@/lib/report/generateScanId";

export default function BusinessSearch() {
  const [inputValue, setInputValue] = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
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
    }
  }, [inputValue, debouncedFetch, selectedPlace]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    // Clear selected place if user is typing something different
    if (selectedPlace && value !== selectedPlace.primary_text) {
      setSelectedPlace(null);
    }
    if (!value) {
      setSelectedPlace(null);
    }
  };

  const handleSelect = (prediction: Prediction) => {
    setSelectedPlace(prediction);
    setInputValue(prediction.primary_text);
    setPredictions([]);
    setIsOpen(false);
    setHighlightedIndex(-1);
    // Prevent autocomplete from re-opening after selection
    inputRef.current?.blur();

    // Navigate immediately when business is selected
    const scanId = generateScanId();
    const params = new URLSearchParams({
      placeId: prediction.place_id,
      name: prediction.primary_text,
      addr: prediction.secondary_text,
    });
    router.push(`/report/${scanId}?${params.toString()}`);
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

  const handleGetReport = () => {
    // Navigation now happens automatically on selection
    // This function is kept for the button, but it will only work if somehow selectedPlace exists
    if (!selectedPlace) return;

    const scanId = generateScanId();
    const params = new URLSearchParams({
      placeId: selectedPlace.place_id,
      name: selectedPlace.primary_text,
      addr: selectedPlace.secondary_text,
    });
    router.push(`/report/${scanId}?${params.toString()}`);
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
    <div className="relative w-full max-w-[720px] mx-auto text-left flex justify-center">
      {/* Search Input Wrapper - relative container for dropdown */}
      <div className="relative inline-block">
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
          placeholder="Find your business name"
          className="h-16 md:h-20 pl-14 pr-[170px] md:pr-[180px] rounded-full border border-gray-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder:text-gray-400 text-lg"
          style={{
            width: inputValue 
              ? `${Math.max(600, Math.min(800, inputValue.length * 14 + 220))}px` 
              : '600px'
          }}
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="autocomplete-list"
        />
        {/* Get Report Button - Inside search bar on the right */}
        <button
          onClick={handleGetReport}
          disabled={!selectedPlace}
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 h-10 md:h-12 px-4 md:px-5 rounded-full font-medium text-sm md:text-base transition-all flex items-center gap-2 bg-blue-500 text-white ${
            selectedPlace
              ? "hover:bg-blue-600 shadow-md hover:shadow-lg cursor-pointer"
              : "cursor-not-allowed"
          }`}
        >
          <Image
            src="/icons/ai icon.svg"
            alt="AI"
            width={18}
            height={18}
            className="md:w-5 md:h-5 brightness-0 invert"
          />
          <span className="whitespace-nowrap">Get my AI report</span>
        </button>

        {/* Autocomplete Dropdown - Owner.com style: compact, left-aligned, native */}
        {isOpen && predictions.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute left-0 top-[calc(100%+8px)] w-full z-50 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
          >
            <ul className="max-h-[320px] overflow-y-auto py-1">
              {predictions.map((prediction, index) => (
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
        )}
      </div>
    </div>
  );
}

