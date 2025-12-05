import { Search, GitBranch, Shield, Sparkles } from "lucide-react";
import SlideLayout from "./SlideLayout";

export default function SlideBaseLens() {
  return (
    <SlideLayout>
      <div className="grid grid-cols-2 gap-16 items-center max-w-6xl w-full">
        {/* Left: Content */}
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Search className="w-8 h-8 text-blue-400" />
              </div>
              <h2 className="text-5xl font-bold text-white">Analyze</h2>
            </div>
            <p className="text-xl text-gray-300 leading-relaxed">
              Our first focus: empowering <span className="text-blue-400 font-semibold">anyone</span>, 
              regardless of technical knowledge, to analyze smart contracts and gain clear insights.
            </p>
          </div>

          {/* Features list */}
          <ul className="space-y-4">
            <li className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <GitBranch className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-white">Interactive Visualization</h4>
                <p className="text-gray-400">Graph view of contract relationships and proxy patterns</p>
              </div>
            </li>
            <li className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-white">Security Insights</h4>
                <p className="text-gray-400">AI-powered vulnerability detection</p>
              </div>
            </li>
            <li className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-white">Plain-Language Explanations</h4>
                <p className="text-gray-400">Complex logic made simple</p>
              </div>
            </li>
          </ul>
        </div>

        {/* Right: Image */}
        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/30 to-cyan-500/30 rounded-3xl blur-3xl opacity-50" />
          <img 
            src="/BaseLens.png" 
            alt="BaseLens Analysis Interface" 
            className="relative rounded-2xl shadow-2xl shadow-blue-500/20 border border-blue-500/20"
          />
        </div>
      </div>
    </SlideLayout>
  );
}
