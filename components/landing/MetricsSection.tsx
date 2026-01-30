"use client";

import Image from "next/image";
import ScrollReveal from "@/components/landing/ScrollReveal";

export default function MetricsSection() {
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
                Metrics that matter
              </span>
            </div>
          </ScrollReveal>

          {/* Headline */}
          <ScrollReveal>
          <h2 className="text-center font-bold text-4xl md:text-5xl lg:text-6xl mb-12 md:mb-16">
            <span style={{ color: "#666b82" }}>"We don't sell generic improvements.</span>
            <br />
            <span className="text-black">We sell specific outcomes."</span>
          </h2>
          </ScrollReveal>

          {/* Dashboard Screenshot */}
          <ScrollReveal className="w-full flex justify-center">
            <Image
              src="/images/dashboardScreenshot.svg"
              alt="Dashboard Screenshot"
              width={1400}
              height={933}
              className="w-full max-w-7xl h-auto"
            />
          </ScrollReveal>

          {/* Outcomes cards — per-element reveal */}
          <div className="mt-10 md:mt-12 lg:mt-14 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            <ScrollReveal
              className="rounded-3xl p-8 md:p-10 bg-white"
              style={{ border: "1px solid rgba(213, 226, 255, 1)" }}
            >
              <div
                className="rounded-2xl p-6 md:p-7 mb-8"
                style={{ backgroundColor: "#F2F5FF" }}
              >
                <Image
                  src="/images/churn graphic.svg"
                  alt="Decrease churn"
                  width={520}
                  height={320}
                  className="w-full h-auto"
                />
              </div>

              <h3 className="text-3xl md:text-4xl font-bold text-gray-900 text-center">
                Decrease churn
              </h3>
              <p className="mt-4 text-lg text-gray-600 text-center leading-relaxed">
                Catch the &quot;Critical Signal&quot; before a customer walks away
                for good.
              </p>
            </ScrollReveal>

            <ScrollReveal
              className="rounded-3xl p-8 md:p-10 bg-white"
              style={{ border: "1px solid rgba(213, 226, 255, 1)" }}
            >
              <div
                className="rounded-2xl p-6 md:p-7 mb-8"
                style={{ backgroundColor: "#F2F5FF" }}
              >
                <Image
                  src="/images/velocity graphic.svg"
                  alt="Increase velocity"
                  width={520}
                  height={320}
                  className="w-full h-auto"
                />
              </div>

              <h3 className="text-3xl md:text-4xl font-bold text-gray-900 text-center">
                Increase velocity
              </h3>
              <p className="mt-4 text-lg text-gray-600 text-center leading-relaxed">
                Turn a 3.9-star perception into a 4.6-star reality.
              </p>
            </ScrollReveal>

            <ScrollReveal
              className="rounded-3xl p-8 md:p-10 bg-white"
              style={{ border: "1px solid rgba(213, 226, 255, 1)" }}
            >
              <div
                className="rounded-2xl p-6 md:p-7 mb-8"
                style={{ backgroundColor: "#F2F5FF" }}
              >
                <Image
                  src="/images/ROI graphic.svg"
                  alt="Validate ROI"
                  width={520}
                  height={320}
                  className="w-full h-auto"
                />
              </div>

              <h3 className="text-3xl md:text-4xl font-bold text-gray-900 text-center">
                Validate ROI
              </h3>
              <p className="mt-4 text-lg text-gray-600 text-center leading-relaxed">
                Watch the &quot;Victory Signal&quot; prove the value of every bit
                of investment made.
              </p>
            </ScrollReveal>
          </div>
        </div>
      </div>
    </section>
  );
}
