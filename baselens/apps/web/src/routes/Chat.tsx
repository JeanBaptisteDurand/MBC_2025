import { useState, useRef, useLayoutEffect } from 'react';
import gsap from 'gsap';
import BackgroundBlobs from '../components/chat/BackgroundBlobs';
import ChatHeader from '../components/chat/ChatHeader';
import InteractionBubbles from '../components/chat/InteractionBubbles';
import ChatFooter from '../components/chat/ChatFooter';

export default function Chat() {
  const [isSplit, setIsSplit] = useState(false);
  const [isChatMode, setIsChatMode] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [hideHeaderFooter, setHideHeaderFooter] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Animate out header and footer when entering chat or voice mode
  useLayoutEffect(() => {
    if (isChatMode || isVoiceMode) {
      const tl = gsap.timeline({
        onComplete: () => setHideHeaderFooter(true)
      });
      
      tl.to(headerRef.current, {
        opacity: 0,
        y: -30,
        duration: 0.4,
        ease: "power2.in"
      }, 0);
      
      tl.to(footerRef.current, {
        opacity: 0,
        y: 30,
        duration: 0.4,
        ease: "power2.in"
      }, 0);
    }
  }, [isChatMode, isVoiceMode]);

  return (
    <div className="relative w-full h-[calc(100vh-65px)] bg-surface-950 overflow-hidden text-white font-sans">
        {/* Background effects - fixed behind content */}
        <BackgroundBlobs />
        
        {/* Overlay Texture for grain (optional, adds to the modern feel) */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDIiLz4KPC9zdmc+')] opacity-20 pointer-events-none z-0"></div>

        {/* Scrollable content area */}
        <div className="relative z-10 w-full h-full overflow-y-auto">
            <div ref={contentRef} className="flex flex-col items-center justify-center min-h-full py-8 gap-16">
                {!hideHeaderFooter && (
                    <div ref={headerRef}>
                        <ChatHeader isSplit={isSplit} />
                    </div>
                )}

                {/* Main Bubble */}
                <InteractionBubbles 
                    isSplit={isSplit} 
                    onSplit={() => setIsSplit(true)} 
                    isChatMode={isChatMode}
                    onChatMode={() => setIsChatMode(true)}
                    isVoiceMode={isVoiceMode}
                    onVoiceMode={() => setIsVoiceMode(true)}
                />

                {!hideHeaderFooter && (
                    <div ref={footerRef}>
                        <ChatFooter />
                    </div>
                )}
            </div>
        </div>
    </div>
  );
}