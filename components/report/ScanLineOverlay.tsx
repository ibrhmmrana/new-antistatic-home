"use client";

export default function ScanLineOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      {/* Single scanning beam line - goes from top to bottom and back */}
      <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-scan-beam shadow-[0_0_20px_rgba(59,130,246,0.6),0_0_40px_rgba(59,130,246,0.4),0_0_60px_rgba(59,130,246,0.3)]" />
      
      {/* Wider wash/glow behind the line - reduced opacity */}
      <div className="absolute left-0 right-0 h-40 bg-gradient-to-b from-blue-500/12 via-blue-500/18 to-blue-500/12 animate-scan-beam blur-3xl" style={{ marginTop: '-20px' }} />
    </div>
  );
}

