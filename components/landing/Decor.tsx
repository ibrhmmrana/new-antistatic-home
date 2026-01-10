"use client";

export default function Decor() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Curved grid background */}
      <div className="absolute bottom-0 left-0 right-0 h-[60%] opacity-30">
        <svg
          className="w-full h-full"
          viewBox="0 0 1200 600"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Curved grid lines */}
          <defs>
            <linearGradient id="gridGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#e5e7eb" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#d1d5db" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          
          {/* Horizontal curved lines */}
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
            const y = 100 + i * 60;
            const curve = Math.sin((i / 8) * Math.PI) * 30;
            return (
              <path
                key={`h-${i}`}
                d={`M 0 ${y} Q 600 ${y + curve} 1200 ${y}`}
                stroke="url(#gridGradient)"
                strokeWidth="1"
                fill="none"
              />
            );
          })}
          
          {/* Vertical lines with slight curve */}
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => {
            const x = 50 + i * 100;
            return (
              <line
                key={`v-${i}`}
                x1={x}
                y1="0"
                x2={x}
                y2="600"
                stroke="url(#gridGradient)"
                strokeWidth="1"
              />
            );
          })}
        </svg>
      </div>

      {/* Colored abstract shapes */}
      <div className="absolute bottom-0 left-0 right-0 h-[50%]">
        {/* Blue shape */}
        <div className="absolute bottom-[15%] left-[10%] w-24 h-24 bg-blue-400 rounded-full opacity-20 blur-xl" />
        
        {/* Green shape */}
        <div className="absolute bottom-[25%] left-[30%] w-32 h-32 bg-green-400 rounded-full opacity-15 blur-xl" />
        
        {/* Yellow shape */}
        <div className="absolute bottom-[20%] right-[25%] w-28 h-28 bg-yellow-400 rounded-full opacity-20 blur-xl" />
        
        {/* Red shape */}
        <div className="absolute bottom-[30%] right-[10%] w-20 h-20 bg-red-400 rounded-full opacity-15 blur-xl" />
        
        {/* Purple shape */}
        <div className="absolute bottom-[10%] left-[50%] w-16 h-16 bg-purple-400 rounded-full opacity-20 blur-xl" />
      </div>

      {/* Small confetti shapes */}
      <div className="absolute inset-0">
        {/* Circles */}
        <div className="absolute top-[20%] left-[15%] w-3 h-3 bg-blue-500 rounded-full opacity-30" />
        <div className="absolute top-[30%] right-[20%] w-2 h-2 bg-green-500 rounded-full opacity-25" />
        <div className="absolute top-[40%] left-[70%] w-4 h-4 bg-yellow-500 rounded-full opacity-20" />
        <div className="absolute top-[25%] right-[40%] w-2.5 h-2.5 bg-red-500 rounded-full opacity-30" />
        
        {/* Half-moons */}
        <div className="absolute top-[35%] left-[45%] w-6 h-6 border-2 border-blue-400 rounded-full opacity-20" style={{ clipPath: "inset(0 50% 0 0)" }} />
        <div className="absolute top-[45%] right-[15%] w-5 h-5 border-2 border-green-400 rounded-full opacity-25" style={{ clipPath: "inset(0 0 0 50%)" }} />
        
        {/* Lines */}
        <div className="absolute top-[50%] left-[60%] w-8 h-0.5 bg-yellow-400 opacity-20 rotate-45" />
        <div className="absolute top-[55%] right-[30%] w-6 h-0.5 bg-red-400 opacity-25 -rotate-12" />
      </div>
    </div>
  );
}

