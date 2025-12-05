import { useNavigate } from 'react-router-dom';
import { Search, MessageCircle, Code, BookOpen, Wallet, ArrowRight, Sparkles, Shield, GitBranch, Mic } from 'lucide-react';

export default function FeaturesSection() {
  const navigate = useNavigate();

  return (
    <div className="relative z-50 bg-surface-950">
      {/* Analyze Section */}
      <section className="py-24 border-t border-surface-800/50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Text Content */}
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <Search className="w-6 h-6 text-blue-400" />
                </div>
                <h2 className="text-3xl font-bold text-white">Analyze</h2>
              </div>
              <p className="text-lg text-surface-300 leading-relaxed">
                Dive deep into smart contracts on the Base blockchain. Whether you're a casual user exploring DeFi protocols 
                or a developer auditing code, Analyze provides the clarity you need.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <GitBranch className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <span className="text-surface-400">Interactive graph visualization of contract relationships and proxy patterns</span>
                </li>
                <li className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <span className="text-surface-400">AI-powered security insights and vulnerability detection</span>
                </li>
                <li className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <span className="text-surface-400">Plain-language explanations of complex smart contract logic</span>
                </li>
              </ul>
              <button 
                onClick={() => navigate('/analyze')}
                className="group flex items-center gap-2 px-6 py-3 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-xl text-blue-400 font-medium transition-all duration-300"
              >
                Start Analyzing
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
            
            {/* Image */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-2xl blur-3xl" />
              <img 
                src="/mock.png" 
                alt="Analyze smart contracts visualization" 
                className="relative rounded-2xl border border-surface-700/50 shadow-2xl shadow-blue-500/10"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Clarify Section */}
      <section className="py-24 border-t border-surface-800/50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Image - reversed order on desktop */}
            <div className="relative lg:order-2">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-2xl blur-3xl" />
              <div className="relative rounded-2xl border border-surface-700/50 bg-surface-900/80 p-8 shadow-2xl shadow-purple-500/10">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-surface-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm">👤</span>
                    </div>
                    <div className="bg-surface-800 rounded-2xl rounded-tl-none px-4 py-3 max-w-xs">
                      <p className="text-surface-300 text-sm">Swap 100 USDC to ETH on the best DEX</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 justify-end">
                    <div className="bg-purple-500/20 border border-purple-500/30 rounded-2xl rounded-tr-none px-4 py-3 max-w-xs">
                      <p className="text-purple-200 text-sm">Found best rate on Uniswap V3. Ready to execute swap: 100 USDC → 0.0412 ETH. Confirm?</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-purple-500/30 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Text Content */}
            <div className="space-y-6 lg:order-1">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-purple-400" />
                </div>
                <h2 className="text-3xl font-bold text-white">Clarify</h2>
              </div>
              <p className="text-lg text-surface-300 leading-relaxed">
                Interact with the blockchain using natural language. No more complex interfaces or confusing transaction builders — just 
                tell Clarify what you want to do.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <MessageCircle className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <span className="text-surface-400">Text-based chat for seamless on-chain interactions</span>
                </li>
                <li className="flex items-start gap-3">
                  <Mic className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <span className="text-surface-400">Voice commands for hands-free blockchain operations</span>
                </li>
                <li className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <span className="text-surface-400">Transaction simulation and confirmation before execution</span>
                </li>
              </ul>
              <button 
                onClick={() => navigate('/chat')}
                className="group flex items-center gap-2 px-6 py-3 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-xl text-purple-400 font-medium transition-all duration-300"
              >
                Try Clarify
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Coming Soon Section */}
      <section className="py-24 border-t border-surface-800/50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white mb-4">Coming Soon</h2>
            <p className="text-surface-400 max-w-2xl mx-auto">
              We're building a comprehensive ecosystem of tools to make blockchain accessible to everyone.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* API Card */}
            <div className="group relative p-6 rounded-2xl bg-surface-900/50 border border-surface-800 hover:border-green-500/30 transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                    <Code className="w-6 h-6 text-green-400" />
                  </div>
                  <span className="px-3 py-1 text-xs font-medium bg-surface-800 text-surface-400 rounded-full">Soon</span>
                </div>
                <h3 className="text-xl font-semibold text-white">API</h3>
                <p className="text-surface-400 text-sm leading-relaxed">
                  Integrate BaseLens capabilities into your own applications. Access contract analysis, AI insights, 
                  and blockchain data through our developer-friendly REST API.
                </p>
              </div>
            </div>

            {/* Learn Card */}
            <div className="group relative p-6 rounded-2xl bg-surface-900/50 border border-surface-800 hover:border-yellow-500/30 transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-yellow-400" />
                  </div>
                  <span className="px-3 py-1 text-xs font-medium bg-surface-800 text-surface-400 rounded-full">Soon</span>
                </div>
                <h3 className="text-xl font-semibold text-white">Learn</h3>
                <p className="text-surface-400 text-sm leading-relaxed">
                  Interactive e-learning platform for blockchain education. Learn with real-world examples 
                  pulled directly from live contracts using our Analyze engine.
                </p>
              </div>
            </div>

            {/* Portfolio Card */}
            <div className="group relative p-6 rounded-2xl bg-surface-900/50 border border-surface-800 hover:border-pink-500/30 transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-pink-500/20 flex items-center justify-center">
                    <Wallet className="w-6 h-6 text-pink-400" />
                  </div>
                  <span className="px-3 py-1 text-xs font-medium bg-surface-800 text-surface-400 rounded-full">Soon</span>
                </div>
                <h3 className="text-xl font-semibold text-white">Portfolio</h3>
                <p className="text-surface-400 text-sm leading-relaxed">
                  AI-powered portfolio management with customizable strategies. Automate complex DeFi operations 
                  like rebalancing across protocols in a single atomic transaction.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer spacer */}
      <div className="h-20" />
    </div>
  );
}
