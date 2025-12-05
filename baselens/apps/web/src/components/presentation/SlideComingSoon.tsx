import { useNavigate } from "react-router-dom";
import { Code, BookOpen, Wallet, Rocket, ArrowRight } from "lucide-react";
import SlideLayout from "./SlideLayout";

interface SlideComingSoonProps {
  onNavigate?: () => void;
}

export default function SlideComingSoon({ onNavigate }: SlideComingSoonProps) {
  const navigate = useNavigate();

  const handleExploreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onNavigate) {
      onNavigate();
    } else {
      navigate("/");
    }
  };

  return (
    <SlideLayout>
      <div className="flex flex-col items-center gap-12 max-w-5xl">
        {/* Title */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Rocket className="w-12 h-12 text-yellow-400" />
          </div>
          <h2 className="text-5xl font-bold text-white">What's Next?</h2>
          <p className="text-xl text-gray-400">
            We're building a comprehensive ecosystem to make blockchain accessible to everyone
          </p>
        </div>

        {/* Coming soon cards */}
        <div className="grid grid-cols-3 gap-8 w-full">
          {/* API Card */}
          <div className="group relative p-8 rounded-2xl bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20 hover:border-green-500/40 transition-all duration-300">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-14 h-14 rounded-xl bg-green-500/20 flex items-center justify-center">
                  <Code className="w-7 h-7 text-green-400" />
                </div>
                <span className="px-3 py-1 text-sm font-medium bg-green-500/20 text-green-400 rounded-full">
                  Soon
                </span>
              </div>
              <h3 className="text-2xl font-semibold text-white">API</h3>
              <p className="text-gray-400 leading-relaxed">
                Integrate BaseLens capabilities into your own applications with our developer-friendly REST API.
              </p>
            </div>
          </div>

          {/* Learn Card */}
          <div className="group relative p-8 rounded-2xl bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border border-yellow-500/20 hover:border-yellow-500/40 transition-all duration-300">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-14 h-14 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                  <BookOpen className="w-7 h-7 text-yellow-400" />
                </div>
                <span className="px-3 py-1 text-sm font-medium bg-yellow-500/20 text-yellow-400 rounded-full">
                  Soon
                </span>
              </div>
              <h3 className="text-2xl font-semibold text-white">Learn</h3>
              <p className="text-gray-400 leading-relaxed">
                Interactive e-learning platform with real-world examples from live contracts.
              </p>
            </div>
          </div>

          {/* Portfolio Card */}
          <div className="group relative p-8 rounded-2xl bg-gradient-to-br from-pink-500/10 to-pink-500/5 border border-pink-500/20 hover:border-pink-500/40 transition-all duration-300">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-14 h-14 rounded-xl bg-pink-500/20 flex items-center justify-center">
                  <Wallet className="w-7 h-7 text-pink-400" />
                </div>
                <span className="px-3 py-1 text-sm font-medium bg-pink-500/20 text-pink-400 rounded-full">
                  Soon
                </span>
              </div>
              <h3 className="text-2xl font-semibold text-white">Portfolio</h3>
              <p className="text-gray-400 leading-relaxed">
                AI-powered portfolio management with automated DeFi strategies.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <button
          onClick={handleExploreClick}
          className="group flex items-center gap-3 px-10 py-5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl text-xl font-semibold transition-all duration-300 shadow-lg shadow-purple-500/25"
        >
          Explore BaseLens
          <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </SlideLayout>
  );
}
