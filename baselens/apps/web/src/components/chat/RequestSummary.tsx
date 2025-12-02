import { ExternalLink, RefreshCw, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface SummaryCard {
    title: string;
    link?: string;
    imageUrl?: string;
}

interface RequestSummaryProps {
    isVisible: boolean;
    cards: SummaryCard[];
    balanceUpdate?: {
        from: string;
        to: string;
        asset: string;
        imageUrl?: string;
    };
}

export default function RequestSummary({ isVisible, cards, balanceUpdate }: RequestSummaryProps) {
    const navigate = useNavigate();

    if (!isVisible) return null;

    const handleNewChat = () => {
        window.location.reload();
    };

    const handleGoHome = () => {
        navigate('/');
    };

    return (
        <div className="mt-6 w-[600px] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <h3 className="text-white font-medium mb-4">
                ✅ Request completed successfully!
            </h3>
            
            {/* Summary Cards */}
            <div className="space-y-3 mb-4">
                {cards.map((card, index) => (
                    <a
                        key={index}
                        href={card.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-white/20 transition-all group cursor-pointer"
                    >
                        {/* Image placeholder */}
                        <div className="w-12 h-12 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {card.imageUrl ? (
                                <img 
                                    src={card.imageUrl} 
                                    alt={card.title}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-6 h-6 rounded bg-white/20" />
                            )}
                        </div>
                        
                        {/* Card content */}
                        <div className="flex-1 min-w-0">
                            <span className="text-white/90 text-sm group-hover:text-white transition-colors">
                                {card.title}
                            </span>
                        </div>
                        
                        {/* External link icon */}
                        {card.link && (
                            <ExternalLink className="w-4 h-4 text-white/40 group-hover:text-primary-400 transition-colors flex-shrink-0" />
                        )}
                    </a>
                ))}
            </div>

            {/* Balance Update Card */}
            {balanceUpdate && (
                <div className="p-4 bg-white/5 border border-white/10 rounded-xl mb-6">
                    <div className="flex items-center gap-4">
                        {/* Image placeholder */}
                        <div className="w-12 h-12 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {balanceUpdate.imageUrl ? (
                                <img 
                                    src={balanceUpdate.imageUrl} 
                                    alt={balanceUpdate.asset}
                                    className="w-8 h-8 object-contain"
                                />
                            ) : (
                                <div className="w-6 h-6 rounded bg-white/20" />
                            )}
                        </div>
                        
                        <div className="flex-1">
                            <span className="text-white/90 text-sm">
                                Your {balanceUpdate.asset} balance was updated from{' '}
                                <span className="text-white/60">{balanceUpdate.from}</span>
                                {' '}to{' '}
                                <span className="text-green-400 font-medium">{balanceUpdate.to}</span>
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-white/10">
                <button
                    onClick={handleNewChat}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-xl transition-colors font-medium"
                >
                    <RefreshCw className="w-4 h-4" />
                    Start New Chat
                </button>
                <button
                    onClick={handleGoHome}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl transition-colors font-medium"
                >
                    <Home className="w-4 h-4" />
                    Return Home
                </button>
            </div>
        </div>
    );
}
