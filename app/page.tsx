import { headers } from "next/headers";
import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import ProductFeatures from "@/components/landing/ProductFeatures";
import Pricing from "@/components/landing/Pricing";
import SocialProof from "@/components/landing/SocialProof";
import MetricsSection from "@/components/landing/MetricsSection";
import Footer from "@/components/landing/Footer";
import HeroImageGate from "@/components/landing/HeroImageGate";
import Image from "next/image";
import { getCountryFromHeaders } from "@/lib/geo";

export default async function Home() {
  const h = await headers();
  const { country } = getCountryFromHeaders(h);

  return (
    <HeroImageGate>
    <main className="relative min-h-screen">
      {/* Sticky Nav - outside hero container to stay sticky throughout */}
      <Nav />
      
      {/* Hero Section with Background */}
      <div className="relative -mt-20 md:-mt-24 lg:-mt-28">
        {/* Background Gradient - only for hero */}
        <div className="absolute inset-0 z-0">
        <Image
            src="/images/background color.svg"
          alt="Background"
          fill
          priority
          className="object-cover"
          quality={90}
          />
        </div>
        <div className="relative z-10 pt-20 md:pt-24 lg:pt-28">
          <Hero />
        </div>
      </div>

      {/* Product Features Section with White Background */}
      <div id="product" className="relative z-10 bg-white scroll-mt-24 md:scroll-mt-28 lg:scroll-mt-32">
        <ProductFeatures />
      </div>

      {/* Pricing Section — country-specific (ZA: R499/R999, rest: $29/$99) */}
      <div id="pricing" className="relative z-10 bg-white scroll-mt-24 md:scroll-mt-28 lg:scroll-mt-32">
        <Pricing countryCode={country} />
      </div>

      {/* Social Proof Section */}
      <div id="insights" className="relative z-10 bg-white scroll-mt-24 md:scroll-mt-28 lg:scroll-mt-32">
        <SocialProof />
      </div>

      {/* Metrics Section */}
      <div className="relative z-10 bg-white">
        <MetricsSection />
      </div>

      {/* Footer */}
      <div className="relative z-10 bg-white">
        <Footer />
      </div>
    </main>
    </HeroImageGate>
  );
}

