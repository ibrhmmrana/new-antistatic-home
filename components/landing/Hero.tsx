import BusinessSearch from "./BusinessSearch";
import RotatingText from "./RotatingText";

export default function Hero() {
  return (
    <div className="relative min-h-[85vh] flex items-start justify-center px-4 pt-8 md:pt-12 lg:pt-16">
      <div className="relative z-10 w-full max-w-4xl mx-auto text-center">
        {/* Headline */}
        <h1 
          className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-7 leading-tight"
          style={{ 
            fontFamily: 'var(--font-product-sans), system-ui, -apple-system, sans-serif',
            fontWeight: 700
          }}
        >
          Your online presence is leaking revenue. Find the leaks with AI.
        </h1>

        {/* Rotating Subheadline */}
        <RotatingText />

        {/* Search Section */}
        <div className="text-left">
          <BusinessSearch />
        </div>
      </div>
    </div>
  );
}

