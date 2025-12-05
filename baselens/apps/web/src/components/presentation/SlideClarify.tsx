import { MessageCircle, Bot, Mic, Shield } from "lucide-react";
import SlideLayout from "./SlideLayout";

export default function SlideClarify() {
  return (
    <SlideLayout>
      <div className="grid grid-cols-2 gap-16 items-center max-w-6xl w-full">
        {/* Left: Image */}
        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-r from-purple-500/30 to-pink-500/30 rounded-3xl blur-3xl opacity-50" />
          <img 
            src="/Clarify.png" 
            alt="Clarify Chat Interface" 
            className="relative rounded-2xl shadow-2xl shadow-purple-500/20 border border-purple-500/20"
          />
        </div>

        {/* Right: Content */}
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <MessageCircle className="w-8 h-8 text-purple-400" />
              </div>
              <h2 className="text-5xl font-bold text-white">Clarify</h2>
            </div>
            <p className="text-xl text-gray-300 leading-relaxed">
              Then we realized: if <span className="text-purple-400 font-semibold">humans</span> can 
              understand smart contracts, <span className="text-purple-400 font-semibold">AI agents</span> can too.
            </p>
            <p className="text-lg text-gray-400">
              Interact with the blockchain using natural language — text or voice. 
              No complex interfaces, just conversation.
            </p>
          </div>

          {/* Features list */}
          <ul className="space-y-4">
            <li className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-white">AI-Powered Agents</h4>
                <p className="text-gray-400">Execute complex on-chain operations autonomously</p>
              </div>
            </li>
            <li className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                <Mic className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-white">Voice Commands</h4>
                <p className="text-gray-400">Hands-free blockchain interactions</p>
              </div>
            </li>
            <li className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-white">Safe Execution</h4>
                <p className="text-gray-400">Transaction simulation before confirmation</p>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </SlideLayout>
  );
}
