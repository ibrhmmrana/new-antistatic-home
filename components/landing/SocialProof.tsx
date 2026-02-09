"use client";

import Image from "next/image";
import ScrollReveal from "@/components/landing/ScrollReveal";
import CountUp from "@/components/landing/CountUp";

type Testimonial = {
  quote: string;
  name: string;
  title: string;
  avatarSrc: string;
};

const testimonials: Testimonial[] = [
  {
    quote:
      "We went from 3.8 to 4.6 stars in eight weeks. We're now the top-rated coffee shop in Observatory. Walk-ins are up 40%.",
    name: "Sarah Mokone",
    title: "Founder, The Grind Café",
    avatarSrc: "/images/first founder.svg",
  },
  {
    quote:
      "The competitor radar showed me exactly when my rival was struggling. I deployed two reels that same day and stole half their weekend traffic. Worth every cent.",
    name: "David Pretorius",
    title: "Owner, Wok This Way",
    avatarSrc: "/images/second founder.svg",
  },
  {
    quote:
      "I used to panic every time I got a bad review. Now I just hit the fix-it-now button and Antistatic handles it. Three days later, it's buried. Game-changer.",
    name: "Thandiwe Dlamini",
    title: "Manager, Fourways Fitness",
    avatarSrc: "/images/third founder.svg",
  },
];

export default function SocialProof() {
  return (
    <section className="relative w-full pt-4 md:pt-6 lg:pt-8 pb-12 md:pb-16 lg:pb-20 bg-white">
      <div className="w-full px-6 md:px-8 lg:px-12">
        <div className="max-w-7xl mx-auto">
          {/* Tag */}
          <ScrollReveal className="w-full flex justify-center">
            <div
              className="inline-flex items-center justify-center w-fit px-5 py-2.5 rounded-full mb-6"
              style={{
                backgroundColor: "#F2F5FF",
                border: "1px solid #D5E2FF",
                boxShadow: "inset 0 -2px 4px rgba(213, 226, 255, 1)",
              }}
            >
              <span className="text-sm text-gray-600 font-medium">
                Social Proof
              </span>
            </div>
          </ScrollReveal>

          {/* Headline */}
          <ScrollReveal>
          <h2
            className="text-center font-bold text-4xl md:text-5xl lg:text-6xl mb-12 md:mb-16"
            style={{ lineHeight: "1.1" }}
          >
            <span className="text-black">Businesses using Antistatic have an</span>{" "}
            <span className="text-black">unfair advantage</span>,{" "}
            <span style={{ color: "#666b82" }}>setting them up to win</span>
          </h2>
          </ScrollReveal>

          {/* Cards — per-element reveal */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {testimonials.map((t) => (
              <ScrollReveal
                key={t.name}
                className="rounded-3xl p-8 md:p-10 bg-white"
                style={{
                  border: "1px solid rgba(213, 226, 255, 1)",
                }}
              >
                <div className="mb-6">
                  <Image
                    src="/images/quotes icon.svg"
                    alt="Quotes"
                    width={44}
                    height={44}
                    className="h-10 w-10"
                  />
                </div>

                <p className="text-gray-700 text-lg leading-relaxed mb-10">
                  {t.quote}
                </p>

                <div className="flex items-center gap-4">
                  <Image
                    src={t.avatarSrc}
                    alt={t.name}
                    width={56}
                    height={56}
                    className="h-14 w-14"
                  />
                  <div>
                    <div className="font-semibold text-gray-900 text-lg">
                      {t.name}
                    </div>
                    <div className="text-gray-600">{t.title}</div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>

          {/* Stats strip */}
          <ScrollReveal
            className="mt-10 md:mt-12 rounded-3xl p-8 md:p-10 lg:p-12 bg-white"
            style={{ border: "1px solid rgba(213, 226, 255, 1)" }}
          >
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-8 lg:gap-10">
              {/* Left copy */}
              <div className="flex-1 min-w-0">
                <div className="mb-4">
                  <Image
                    src="/images/five stars.svg"
                    alt="Five stars"
                    width={110}
                    height={20}
                    className="h-5 w-auto"
                  />
                </div>

                <h3 className="text-3xl md:text-4xl font-bold text-gray-900 leading-tight" style={{ maxWidth: '250px' }}>
                  Turn Trust Into
                  <br />
                  Growth
                </h3>

                <p className="mt-4 text-gray-600" style={{ maxWidth: '250px' }}>
                  Clear progress in reputation, trust, and customer retention
                </p>
              </div>

              {/* Right blocks */}
              <div className="flex flex-col sm:flex-row gap-4 md:gap-5 lg:gap-6">
                <div className="rounded-2xl bg-[#F2F5FF] px-7 py-7 md:px-8 md:py-8 w-full sm:w-[220px]">
                  <div className="text-base text-gray-600 mb-8">
                    Average rating
                    <br />
                    increase
                  </div>
                  <div className="flex items-end gap-1">
                    <CountUp
                      value={0.7}
                      decimals={1}
                      className="text-6xl font-semibold text-[#4F7DFF]"
                    />
                    <span className="text-2xl font-semibold text-[#4F7DFF] pb-1">
                      stars
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl bg-[#F2F5FF] px-7 py-7 md:px-8 md:py-8 w-full sm:w-[220px]">
                  <div className="text-base text-gray-600 mb-8">
                    Average time to
                    <br />
                    4.5+ stars
                  </div>
                  <div className="flex items-end gap-2">
                    <CountUp
                      value={76}
                      className="text-6xl font-semibold text-[#4F7DFF]"
                    />
                    <span className="text-2xl font-semibold text-[#4F7DFF] pb-1">
                      days
                    </span>
                  </div>
                </div>

                {/* Purple block background + overlay text */}
                <div className="relative w-full sm:w-[220px] overflow-hidden rounded-2xl">
                  <Image
                    src="/images/purple block.svg"
                    alt=""
                    fill
                    className="object-cover"
                    priority={false}
                  />

                  <div className="relative z-10 px-7 py-7 md:px-8 md:py-8 h-full flex flex-col justify-between">
                    <div className="text-base text-white/85">
                      Customer
                      <br />
                      retention
                    </div>

                    <CountUp
                      value={94}
                      suffix="%"
                      className="font-semibold leading-none"
                      style={{ color: "#8B5CF6", fontSize: "64px" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

