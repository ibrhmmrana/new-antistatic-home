import Link from "next/link";

export default function Nav() {
  return (
    <nav className="relative z-20 w-full px-6 py-4 md:px-8 md:py-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="text-xl font-semibold text-gray-900 hover:text-gray-700 transition-colors">
          Antistatic
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors px-3 py-2"
          >
            Login
          </Link>
          <Link
            href="/demo"
            className="text-sm bg-gray-900 text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors"
          >
            Get a demo
          </Link>
        </div>
      </div>
    </nav>
  );
}

