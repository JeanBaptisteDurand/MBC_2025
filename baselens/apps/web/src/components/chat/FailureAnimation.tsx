import { useEffect, useRef } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { SummaryCard } from './RequestSummary';

interface FailureAnimationProps {
    errorMessage?: string;
    transactionHistory?: SummaryCard[];
}

export default function FailureAnimation({ errorMessage, transactionHistory }: FailureAnimationProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Animate the failure state appearance
        if (containerRef.current) {
            containerRef.current.style.opacity = '0';
            containerRef.current.style.transform = 'scale(0.95)';
            
            requestAnimationFrame(() => {
                if (containerRef.current) {
                    containerRef.current.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
                    containerRef.current.style.opacity = '1';
                    containerRef.current.style.transform = 'scale(1)';
                }
            });
        }
    }, []);

    return (
        <div
            ref={containerRef}
            className="mt-6 w-[600px] bg-gradient-to-br from-red-900/30 to-red-800/20 backdrop-blur-xl border-2 border-red-500/50 rounded-2xl p-8 relative overflow-hidden"
            style={{
                boxShadow: "0 0 80px rgba(239, 68, 68, 0.3)"
            }}
        >
            {/* Animated background pulse */}
            <div className="absolute inset-0 bg-red-500/10 animate-pulse" />
            
            {/* Content */}
            <div className="relative z-10">
                {/* Failure Icon */}
                <div className="flex justify-center mb-6">
                    <div className="w-20 h-20 rounded-full bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center animate-bounce">
                        <X className="w-10 h-10 text-red-400" strokeWidth={3} />
                    </div>
                </div>

                {/* Error Title */}
                <h3 className="text-center text-white font-semibold text-xl mb-3">
                    Execution Failed
                </h3>

                {/* Error Message */}
                {errorMessage && (
                    <p className="text-center text-red-200 text-sm mb-6 px-4">
                        {errorMessage}
                    </p>
                )}

                {/* Transaction History Section */}
                {transactionHistory && transactionHistory.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-red-500/30">
                        <h4 className="text-white/90 font-medium text-sm mb-3">
                            Transaction History
                        </h4>
                        <div className="space-y-2">
                            {transactionHistory.map((card, index) => (
                                <a
                                    key={index}
                                    href={card.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 p-3 bg-white/5 border border-red-500/20 rounded-lg hover:bg-white/10 hover:border-red-500/40 transition-all group cursor-pointer"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-white/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                                        {card.imageUrl ? (
                                            <img 
                                                src={card.imageUrl} 
                                                alt={card.title}
                                                className="w-5 h-5 object-cover"
                                            />
                                        ) : (
                                            <div className="w-4 h-4 rounded bg-red-500/20" />
                                        )}
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <span className="text-white/80 text-sm group-hover:text-white transition-colors">
                                            {card.title}
                                        </span>
                                    </div>
                                    
                                    <ExternalLink className="w-4 h-4 text-red-400/60 group-hover:text-red-400 transition-colors flex-shrink-0" />
                                </a>
                            ))}
                        </div>
                    </div>
                )}

                {/* Info Message */}
                <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-red-200 text-xs text-center">
                        {transactionHistory && transactionHistory.length > 0
                            ? "Your funds have been returned. Check the transaction history above for details."
                            : "The system will attempt to return your funds automatically."}
                    </p>
                </div>
            </div>
        </div>
    );
}

