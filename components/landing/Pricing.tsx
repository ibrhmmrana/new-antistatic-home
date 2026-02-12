"use client";

import Image from "next/image";
import ScrollReveal from "@/components/landing/ScrollReveal";
import { scrollToHeroInputAndShowTooltip } from "@/components/landing/Hero";

/** ZA = South Africa (R499/R999); rest of world = $29/$99. Compare = before discount. */
const isZA = (countryCode: string) => countryCode === "ZA";

function PriceBlock({ compare, current, save }: { compare: string; current: string; save: string }) {
  return (
    <div className="mb-6">
      {/* Compare row: strikethrough + save badge */}
      <div className="flex items-center gap-2.5 mb-1">
        <span className="text-base md:text-lg text-gray-400 line-through decoration-gray-400/70">
          {compare}
        </span>
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium tracking-wide uppercase text-gray-600"
          style={{
            backgroundColor: "#E8EDFA",
            border: "1px solid #C5D4F0",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
          }}
        >
          Save {save}
        </span>
      </div>
      {/* Current price */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-4xl md:text-5xl font-bold text-gray-900">{current}</span>
        <span className="text-sm text-gray-500">/month</span>
      </div>
    </div>
  );
}

export default function Pricing({ countryCode = "XX" }: { countryCode?: string }) {
  const za = isZA(countryCode);
  const essentialPrice = za ? "R499" : "$29";
  const fullEnginePrice = za ? "R999" : "$99";
  const essentialCompare = za ? "R999" : "$49";
  const fullEngineCompare = za ? "R1,499" : "$149";
  const essentialSave = za ? "50%" : "41%";
  const fullEngineSave = za ? "33%" : "34%";

  return (
    <section className="relative w-full pt-4 md:pt-6 lg:pt-8 pb-12 md:pb-16 lg:pb-20 bg-white">
      <div className="w-full px-6 md:px-8 lg:px-12">
        {/* Header Section */}
        <ScrollReveal className="max-w-4xl mx-auto text-center mb-12 md:mb-16">
          {/* Pricing Tag */}
          <div className="inline-flex items-center justify-center w-fit px-5 py-2.5 rounded-full mb-6"
            style={{
              backgroundColor: '#F2F5FF',
              border: '1px solid #D5E2FF',
              boxShadow: 'inset 0 -2px 4px rgba(213, 226, 255, 1)'
            }}
          >
            <span className="text-sm text-gray-600 font-medium">Pricing</span>
          </div>

          {/* Main Headline */}
          <h2 
            className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4"
            style={{ 
              fontWeight: 700,
              color: '#666b82',
              lineHeight: '1.2'
            }}
          >
            Digital health and commercial<br />wellness <span className="font-bold" style={{ color: '#000000' }}>ready</span> to scale with you
          </h2>

          {/* Description */}
          <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
            Antistatic operates on a unique cover charge + real spend model, ensuring you only pay for the action you need to increase your business velocity.
          </p>
        </ScrollReveal>

        {/* Pricing Cards — per-element reveal */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 max-w-4xl mx-auto">
          {/* Essential Monitoring Card */}
          <ScrollReveal
            className="rounded-2xl p-8 md:p-12 lg:p-16"
            style={{
              backgroundColor: '#F2F5FF',
              border: '1px solid #D5E2FF',
              boxShadow: 'inset 0 -2px 4px rgba(213, 226, 255, 1)'
            }}
          >
            <h3 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: '#3b82f6' }}>
              Essential Monitoring
            </h3>
            <p className="text-sm md:text-base text-gray-600 mb-6">
              Basic features
            </p>
            
            <PriceBlock compare={essentialCompare} current={essentialPrice} save={essentialSave} />

            {/* Separator */}
            <div className="mb-6">
              <Image src="/images/seperator.svg" alt="Separator" width={400} height={20} className="w-full h-auto" />
            </div>

            {/* Features List */}
            <ul className="space-y-5 mb-8">
              <li className="flex items-start gap-3">
                <Image src="/images/check mark.svg" alt="Check" width={20} height={20} className="flex-shrink-0 mt-0.5" />
                <span className="text-gray-700 leading-relaxed">24/7 AI reputation monitoring</span>
              </li>
              <li className="flex items-start gap-3">
                <Image src="/images/check mark.svg" alt="Check" width={20} height={20} className="flex-shrink-0 mt-0.5" />
                <span className="text-gray-700 leading-relaxed">Competitor radar (track up to 2 competitors)</span>
              </li>
              <li className="flex items-start gap-3">
                <Image src="/images/check mark.svg" alt="Check" width={20} height={20} className="flex-shrink-0 mt-0.5" />
                <span className="text-gray-700 leading-relaxed">Daily alerts (critical, opportunity, victory signals)</span>
              </li>
              <li className="flex items-start gap-3">
                <Image src="/images/check mark.svg" alt="Check" width={20} height={20} className="flex-shrink-0 mt-0.5" />
                <span className="text-gray-700 leading-relaxed">Reputation hub (unified feed: Google, Facebook, Instagram)</span>
              </li>
              <li className="flex items-start gap-3">
                <Image src="/images/check mark.svg" alt="Check" width={20} height={20} className="flex-shrink-0 mt-0.5" />
                <span className="text-gray-700 leading-relaxed">Basic social studio (content creation)</span>
              </li>
            </ul>

            {/* Separator */}
            <div className="mb-8">
              <Image src="/images/seperator.svg" alt="Separator" width={400} height={20} className="w-full h-auto" />
            </div>

            {/* CTA Button */}
            <button
              type="button"
              onClick={scrollToHeroInputAndShowTooltip}
              className="relative w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 font-medium hover:from-blue-600 hover:to-blue-700 transition-all flex items-center justify-center button-roll-text"
              style={{ borderRadius: "50px" }}
              data-text="Start free 14-day trial"
            >
              <span>Start free 14-day trial</span>

              <div
                className="absolute right-[1px] top-[1px] bottom-[1px] aspect-square flex items-center justify-center button-icon-rotate"
                style={{ borderRadius: "9999px" }}
              >
                <Image
                 src="/images/arrow icon.svg"
                 alt="Arrow"
                 width={32}
                 height={32}
                 className="flex-shrink-0"
                />
              </div>
            </button>
          </ScrollReveal>

          {/* Full Engine Card */}
          <ScrollReveal
            className="rounded-2xl p-8 md:p-12 lg:p-16"
            style={{
              backgroundColor: '#F2F5FF',
              border: '1px solid #D5E2FF',
              boxShadow: 'inset 0 -2px 4px rgba(213, 226, 255, 1)'
            }}
          >
            <h3 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: '#3b82f6' }}>
              Full Engine
            </h3>
            <p className="text-sm md:text-base text-gray-600 mb-6">
              Everything in Essential, plus more
            </p>
            
            <PriceBlock compare={fullEngineCompare} current={fullEnginePrice} save={fullEngineSave} />

            {/* Separator */}
            <div className="mb-6">
              <Image src="/images/seperator.svg" alt="Separator" width={400} height={20} className="w-full h-auto" />
            </div>

            {/* Features List */}
            <ul className="space-y-5 mb-8">
              <li className="flex items-start gap-3">
                <Image src="/images/check mark.svg" alt="Check" width={20} height={20} className="flex-shrink-0 mt-0.5" />
                <span className="text-gray-700 leading-relaxed">Competitor radar (unlimited)</span>
              </li>
              <li className="flex items-start gap-3">
                <Image src="/images/check mark.svg" alt="Check" width={20} height={20} className="flex-shrink-0 mt-0.5" />
                <span className="text-gray-700 leading-relaxed">Advanced social studio (unlimited posts + AI content suggestions)</span>
              </li>
              <li className="flex items-start gap-3">
                <Image src="/images/check mark.svg" alt="Check" width={20} height={20} className="flex-shrink-0 mt-0.5" />
                <span className="text-gray-700 leading-relaxed">Creator hub access (get reviews on-demand)</span>
              </li>
              <li className="flex items-start gap-3">
                <Image src="/images/check mark.svg" alt="Check" width={20} height={20} className="flex-shrink-0 mt-0.5" />
                <span className="text-gray-700 leading-relaxed">Marketplace access (agencies, services, tools)</span>
              </li>
              <li className="flex items-start gap-3">
                <Image src="/images/check mark.svg" alt="Check" width={20} height={20} className="flex-shrink-0 mt-0.5" />
                <span className="text-gray-700 leading-relaxed">Priority support</span>
              </li>
            </ul>

            {/* Separator */}
            <div className="mb-8">
              <Image src="/images/seperator.svg" alt="Separator" width={400} height={20} className="w-full h-auto" />
            </div>

            {/* CTA Button */}
            <button
              type="button"
              onClick={scrollToHeroInputAndShowTooltip}
              className="relative w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 font-medium hover:from-blue-600 hover:to-blue-700 transition-all flex items-center justify-center button-roll-text"
              style={{ borderRadius: "50px" }}
              data-text="Start free 14-day trial"
            >
              <span>Start free 14-day trial</span>

              <div
                className="absolute right-[1px] top-[1px] bottom-[1px] aspect-square flex items-center justify-center button-icon-rotate"
                style={{ borderRadius: "9999px" }}
              >
                <Image
                 src="/images/arrow icon.svg"
                 alt="Arrow"
                 width={32}
                 height={32}
                 className="flex-shrink-0"
                />
              </div>
            </button>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
