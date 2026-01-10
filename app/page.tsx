import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="relative min-h-screen">
      {/* Background Image */}
      <div className="fixed inset-0 z-0">
        <Image
          src="/images/Most-Advanced-TPU_1.max-2500x2500 (1).png"
          alt="Background"
          fill
          priority
          className="object-cover"
          quality={90}
          style={{ opacity: 1 }}
        />
      </div>

      {/* Content on top */}
      <div className="relative z-10">
        <Nav />
        <Hero />
      </div>

      {/* Sticky footer links - bottom left */}
      <div className="fixed bottom-4 left-4 z-20 flex flex-col gap-2">
        <Link
          href="/privacy"
          className="text-xs text-gray-600 hover:text-gray-900 transition-colors px-3 py-1.5 bg-white/80 backdrop-blur-sm rounded-md hover:bg-white/90 shadow-sm"
        >
          Privacy Policy
        </Link>
        <Link
          href="/terms"
          className="text-xs text-gray-600 hover:text-gray-900 transition-colors px-3 py-1.5 bg-white/80 backdrop-blur-sm rounded-md hover:bg-white/90 shadow-sm"
        >
          Terms of Service
        </Link>
        <Link
          href="/data-deletion"
          className="text-xs text-gray-600 hover:text-gray-900 transition-colors px-3 py-1.5 bg-white/80 backdrop-blur-sm rounded-md hover:bg-white/90 shadow-sm"
        >
          Data Deletion
        </Link>
      </div>
    </main>
  );
}

