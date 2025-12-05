import { Users, Search, MessageCircle, ShieldCheck, Code2, Briefcase, GraduationCap, Zap } from "lucide-react";
import SlideLayout from "./SlideLayout";

const baseLensAudience = [
  {
    icon: ShieldCheck,
    title: "Casual Users",
    description: "Verify if a smart contract is reliable or malicious before interacting",
  },
  {
    icon: Code2,
    title: "Developers",
    description: "Deep dive into the logic and architecture of smart contracts",
  },
  {
    icon: Briefcase,
    title: "Partners & Regulators",
    description: "Verify contracts actually do what they claim to do",
  },
];

const clarifyAudience = [
  {
    icon: GraduationCap,
    title: "Blockchain Beginners",
    description: "Unsure how to interact with the blockchain? Just ask.",
  },
  {
    icon: Zap,
    title: "Power Users",
    description: "Quickly test advanced strategies without building complex interfaces",
  },
];

export default function SlideAudience() {
  return (
    <SlideLayout>
      <div className="flex flex-col items-center gap-10 max-w-6xl w-full">
        {/* Title */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Users className="w-12 h-12 text-cyan-400" />
          </div>
          <h2 className="text-5xl font-bold text-white">Who Is This For?</h2>
          <p className="text-xl text-gray-400 max-w-2xl">
            Our tools serve a wide range of users in the blockchain ecosystem
          </p>
        </div>

        {/* Two columns */}
        <div className="grid grid-cols-2 gap-12 w-full">
          {/* BaseLens Column */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Search className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-2xl font-semibold text-blue-400">Analyze</h3>
            </div>

            <div className="space-y-4">
              {baseLensAudience.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div
                    key={index}
                    className="flex items-start gap-4 p-4 rounded-xl bg-gray-900/50 border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300"
                  >
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-white">{item.title}</h4>
                      <p className="text-gray-400 text-sm">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Clarify Column */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="text-2xl font-semibold text-purple-400">Clarify</h3>
            </div>

            <div className="space-y-4">
              {clarifyAudience.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div
                    key={index}
                    className="flex items-start gap-4 p-4 rounded-xl bg-gray-900/50 border border-purple-500/20 hover:border-purple-500/40 transition-all duration-300"
                  >
                    <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-white">{item.title}</h4>
                      <p className="text-gray-400 text-sm">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom tagline */}
        <div className="text-center mt-4">
          <p className="text-xl font-light text-gray-300">
            From <span className="text-blue-400 font-medium">curious beginners</span> to{" "}
            <span className="text-purple-400 font-medium">seasoned professionals</span>
          </p>
        </div>
      </div>
    </SlideLayout>
  );
}
