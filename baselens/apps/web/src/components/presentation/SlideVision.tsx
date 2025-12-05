import { Target, Brain, GitBranch, MessageCircle, Bot, Zap } from "lucide-react";
import SlideLayout from "./SlideLayout";

const objectives = [
  {
    icon: Brain,
    title: "Human-Friendly Onchain",
    description: "AI-powered insights to demystify smart contracts for everyone",
    color: "blue",
  },
  {
    icon: GitBranch,
    title: "Visual Exploration",
    description: "Transform complex systems into intuitive, explorable graphs",
    color: "purple",
  },
  {
    icon: MessageCircle,
    title: "Natural Language Queries",
    description: "Ask \"What does this contract do?\" and get accurate answers",
    color: "pink",
  },
  {
    icon: Bot,
    title: "Autonomous Execution",
    description: "AI agents handle swaps, staking, and batch transactions",
    color: "green",
  },
  {
    icon: Zap,
    title: "Built on Base",
    description: "Fast, cheap, and developer-friendly L2 infrastructure",
    color: "yellow",
  },
];

const colorClasses: Record<string, { bg: string; text: string; border: string }> = {
  blue: { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/30" },
  purple: { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/30" },
  pink: { bg: "bg-pink-500/20", text: "text-pink-400", border: "border-pink-500/30" },
  green: { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/30" },
  yellow: { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/30" },
};

export default function SlideVision() {
  return (
    <SlideLayout>
      <div className="flex flex-col items-center gap-10 max-w-6xl w-full">
        {/* Title */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Target className="w-12 h-12 text-blue-400" />
          </div>
          <h2 className="text-5xl font-bold text-white">Vision & Objectives</h2>
          <p className="text-xl text-gray-400 max-w-2xl">
            Making blockchain accessible through AI-powered understanding and execution
          </p>
        </div>

        {/* Objectives Grid */}
        <div className="grid grid-cols-5 gap-4 w-full">
          {objectives.map((objective, index) => {
            const colors = colorClasses[objective.color];
            const Icon = objective.icon;
            return (
              <div
                key={index}
                className={`relative p-6 rounded-2xl bg-gray-900/50 border ${colors.border} hover:scale-105 transition-transform duration-300`}
              >
                <div className="flex flex-col items-center text-center gap-4">
                  <div className={`w-14 h-14 rounded-xl ${colors.bg} flex items-center justify-center`}>
                    <Icon className={`w-7 h-7 ${colors.text}`} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-white leading-tight">
                      {objective.title}
                    </h3>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      {objective.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom tagline */}
        <div className="text-center mt-4">
          <p className="text-2xl font-light text-gray-300">
            <span className="text-blue-400 font-medium">Understand</span> · 
            <span className="text-purple-400 font-medium"> Explore</span> · 
            <span className="text-pink-400 font-medium"> Execute</span>
          </p>
        </div>
      </div>
    </SlideLayout>
  );
}
