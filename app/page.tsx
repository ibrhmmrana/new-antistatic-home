import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import Image from "next/image";

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
    </main>
  );
}

