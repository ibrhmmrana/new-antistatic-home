"use client";

import Image from "next/image";
import ScrollReveal from "@/components/landing/ScrollReveal";

export default function ProductFeatures() {
  return (
    <section className="relative w-full pt-8 md:pt-12 lg:pt-16 pb-4 md:pb-6 lg:pb-8">
      <div className="w-full">
        {/* Header Section */}
        <ScrollReveal className="max-w-4xl mx-auto text-center mb-12 md:mb-16 px-6 md:px-8 lg:px-12">
          {/* Product Tag */}
          <div className="inline-flex items-center justify-center w-fit px-5 py-2.5 rounded-full mb-6"
            style={{
              backgroundColor: '#F2F5FF',
              border: '1px solid #D5E2FF',
              boxShadow: 'inset 0 -2px 4px rgba(213, 226, 255, 1)'
            }}
          >
            <span className="text-sm text-gray-600 font-medium">Product</span>
          </div>

          {/* Main Headline — mobile: fixed 3-line break; desktop: original */}
          <h2 
            className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4"
            style={{ 
              fontWeight: 700,
              color: '#666b82',
              lineHeight: '1.2'
            }}
          >
            {/* Mobile only: Antistatic Reputation- / as-a-Service / product set */}
            <span className="lg:hidden">
              Antistatic <span style={{ color: '#000000' }}>Reputation-<br />as-a-Service</span><br />product set
            </span>
            {/* Desktop: original line break */}
            <span className="hidden lg:inline">
              Antistatic <span style={{ color: '#000000' }}>Reputation-as-a-<br />Service</span> product set
            </span>
          </h2>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
            A comprehensive suite designed to calibrate your commercial wellbeing.
          </p>
        </ScrollReveal>

        {/* Feature Cards — each card aligned on mobile, per-element reveal */}
        <div className="flex flex-col lg:flex-row gap-0 w-full px-6 md:px-8 lg:px-12 items-center lg:items-stretch">
          <ScrollReveal className="relative w-full lg:w-1/2 flex-shrink-0 pt-4 pb-0 px-4 md:pt-6 md:pb-0 md:px-0 md:pl-6 md:pr-3">
            <Image
              src="/images/competitor radar.svg"
              alt="Competitor radar visualization"
              width={800}
              height={600}
              className="w-full h-auto"
            />
          </ScrollReveal>
          <ScrollReveal className="relative w-full lg:w-1/2 flex-shrink-0 pt-4 pb-0 px-4 md:pt-6 md:pb-0 md:px-0 md:pl-3 md:pr-6">
            <Image
              src="/images/reputation hub.svg"
              alt="Reputation hub visualization"
              width={800}
              height={600}
              className="w-full h-auto"
            />
          </ScrollReveal>
        </div>

        {/* Second Row of Feature Cards */}
        <div className="flex flex-col lg:flex-row gap-0 w-full px-6 md:px-8 lg:px-12 mt-0 items-center lg:items-stretch">
          <ScrollReveal className="relative w-full lg:w-1/2 flex-shrink-0 pt-4 pb-4 px-4 md:pt-6 md:pb-6 md:px-0 md:pl-6 md:pr-3">
            <Image
              src="/images/creator hub.svg"
              alt="Creator hub visualization"
              width={800}
              height={600}
              className="w-full h-auto"
            />
          </ScrollReveal>
          <ScrollReveal className="relative w-full lg:w-1/2 flex-shrink-0 pt-4 pb-4 px-4 md:pt-6 md:pb-6 md:px-0 md:pl-3 md:pr-6">
            <Image
              src="/images/social studio.svg"
              alt="Social studio visualization"
              width={800}
              height={600}
              className="w-full h-auto"
            />
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
