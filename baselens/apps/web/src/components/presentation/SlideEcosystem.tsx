import { Hexagon, Search, MessageCircle, Wallet, Code, BookOpen } from "lucide-react";
import SlideLayout from "./SlideLayout";

export default function SlideEcosystem() {
  return (
    <SlideLayout>
      <div className="flex flex-col items-center gap-12 max-w-5xl">
        {/* Title */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-4 mb-6">
            <Hexagon className="w-16 h-16 text-blue-500" />
            <h1 className="text-7xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              BaseLens
            </h1>
          </div>
          <p className="text-3xl text-gray-300 font-light">
            Your new ecosystem of tools for the Base blockchain
          </p>
        </div>

        {/* Ecosystem illustration */}
        <div className="relative w-full max-w-4xl">
          <img 
            src="/baselens_ecosystem.png" 
            alt="BaseLens Ecosystem" 
            className="w-full rounded-2xl shadow-2xl shadow-blue-500/20 border border-gray-700/50"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-2xl pointer-events-none" />
        </div>

        {/* Feature icons */}
        <div className="flex items-center gap-8 mt-4">
          <div className="flex items-center gap-2 text-blue-400">
            <Search className="w-6 h-6" />
            <span className="text-lg">Analyze</span>
          </div>
          <div className="flex items-center gap-2 text-purple-400">
            <MessageCircle className="w-6 h-6" />
            <span className="text-lg">Clarify</span>
          </div>
          <div className="flex items-center gap-2 text-green-400">
            <Code className="w-6 h-6" />
            <span className="text-lg">API</span>
          </div>
          <div className="flex items-center gap-2 text-yellow-400">
            <BookOpen className="w-6 h-6" />
            <span className="text-lg">Learn</span>
          </div>
          <div className="flex items-center gap-2 text-pink-400">
            <Wallet className="w-6 h-6" />
            <span className="text-lg">Portfolio</span>
          </div>
        </div>
      </div>
    </SlideLayout>
  );
}
