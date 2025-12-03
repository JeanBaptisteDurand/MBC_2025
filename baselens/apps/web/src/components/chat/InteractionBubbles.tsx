import { useRef, useLayoutEffect } from 'react';
import gsap from 'gsap';
import Bubble from '../Bubble';
import ChatInterface from './ChatInterface';

interface InteractionBubblesProps {
    isSplit: boolean;
    onSplit: () => void;
    isChatMode: boolean;
    onChatMode: () => void;
}

export default function InteractionBubbles({ isSplit, onSplit, isChatMode, onChatMode }: InteractionBubblesProps) {
    const bubbleRef = useRef<HTMLDivElement>(null);
    const secondBubbleRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const chatInterfaceRef = useRef<HTMLDivElement>(null);
    const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
    const chatHoverTimerRef = useRef<NodeJS.Timeout | null>(null);

    const handleBubbleMouseEnter = () => {
        if (isSplit) return;
        hoverTimerRef.current = setTimeout(() => {
            onSplit();
        }, 1000);
    };

    const handleBubbleMouseLeave = () => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
    };

    const handleChatBubbleMouseEnter = () => {
        if (isChatMode) return;
        chatHoverTimerRef.current = setTimeout(() => {
            onChatMode();
        }, 1000);
    };

    const handleChatBubbleMouseLeave = () => {
        if (chatHoverTimerRef.current) {
            clearTimeout(chatHoverTimerRef.current);
            chatHoverTimerRef.current = null;
        }
    };

    useLayoutEffect(() => {
        const ctx = gsap.context(() => {
             // Initial entrance for main bubble
             gsap.from(bubbleRef.current, { 
                 scale: 0, 
                 opacity: 0, 
                 duration: 1.5, 
                 ease: "elastic.out(1, 0.5)", 
                 delay: 1.5 
             });

             // Idle animation
             gsap.to(bubbleRef.current, {
                y: 15,
                duration: 3,
                repeat: -1,
                yoyo: true,
                ease: "sine.inOut"
              });
        }, containerRef);
        return () => ctx.revert();
    }, []);

    // Split animation when bubbles separate
    useLayoutEffect(() => {
        if (isSplit && !isChatMode && bubbleRef.current && secondBubbleRef.current) {
            const ctx = gsap.context(() => {
                gsap.killTweensOf(bubbleRef.current);
        
                gsap.to(bubbleRef.current, {
                    x: -150,
                    y: 0,
                    duration: 1,
                    ease: "power3.out"
                });
                
                gsap.fromTo(secondBubbleRef.current, 
                    { x: 0, scale: 0, opacity: 0 },
                    { 
                        x: 150, 
                        scale: 1, 
                        opacity: 1, 
                        duration: 1, 
                        ease: "power3.out" 
                    }
                );
            }, containerRef);
            return () => ctx.revert();
        }
    }, [isSplit, isChatMode]);

    // Chat mode transformation animation
    useLayoutEffect(() => {
        if (isChatMode && secondBubbleRef.current && chatInterfaceRef.current) {
            const ctx = gsap.context(() => {
                // Kill any existing tweens
                gsap.killTweensOf(bubbleRef.current);
                gsap.killTweensOf(secondBubbleRef.current);

                // Fade out the voice bubble
                gsap.to(bubbleRef.current, {
                    opacity: 0,
                    scale: 0.5,
                    duration: 0.5,
                    ease: "power2.in"
                });

                // Transform chat bubble into rectangle
                gsap.to(secondBubbleRef.current, {
                    opacity: 0,
                    scale: 0.8,
                    duration: 0.3,
                    ease: "power2.in"
                });

                // Animate in the chat interface
                gsap.fromTo(chatInterfaceRef.current,
                    { 
                        opacity: 0, 
                        scale: 0.8,
                        y: 20
                    },
                    { 
                        opacity: 1, 
                        scale: 1,
                        y: 0,
                        duration: 0.6,
                        delay: 0.3,
                        ease: "power3.out"
                    }
                );
            }, containerRef);
            return () => ctx.revert();
        }
    }, [isChatMode]);

    return (
        <div ref={containerRef} className={`relative flex justify-center items-center ${isChatMode ? 'w-[600px]' : 'w-36 h-36 md:w-48 md:h-48'}`}>
            {!isChatMode && (
                <>
                    <div className="absolute flex justify-center items-center">
                        <Bubble 
                            ref={bubbleRef} 
                            onMouseEnter={handleBubbleMouseEnter}
                            onMouseLeave={handleBubbleMouseLeave}
                        >
                            <span className={`text-sm font-medium transition-opacity duration-500 ${isSplit ? 'opacity-100' : 'opacity-0'}`}>
                                Start voice interaction
                            </span>
                        </Bubble>
                    </div>
                    {isSplit && (
                        <div className="absolute flex justify-center items-center">
                            <Bubble 
                                ref={secondBubbleRef}
                                onMouseEnter={handleChatBubbleMouseEnter}
                                onMouseLeave={handleChatBubbleMouseLeave}
                            >
                                <span className="text-sm font-medium">
                                    Start text chat interaction
                                </span>
                            </Bubble>
                        </div>
                    )}
                </>
            )}
            
            {/* Chat Interface - shown when in chat mode */}
            {isChatMode && (
                <div 
                    ref={chatInterfaceRef} 
                    className="w-full"
                >
                    <ChatInterface isVisible={isChatMode} />
                </div>
            )}
        </div>
    );
}
