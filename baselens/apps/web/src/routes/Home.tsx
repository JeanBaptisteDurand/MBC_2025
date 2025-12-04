import { useState, useEffect, useRef, useCallback } from 'react';
import ParticleScene from '../components/home/ParticleScene';
import FloatingTools from '../components/home/FloatingTools';
import HeroContent from '../components/home/HeroContent';
import FeaturesSection from '../components/home/FeaturesSection';

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [cameraAnimationComplete, setCameraAnimationComplete] = useState(false);
  const [scrollLocked, setScrollLocked] = useState(false);
  
  // Track the "virtual" scroll position (rate-limited)
  const virtualScrollY = useRef(0);

  // Scroll threshold where camera animation completes (in pixels)
  const SCROLL_THRESHOLD = 800;
  // Maximum scroll delta per event (limits scroll speed)
  const MAX_SCROLL_DELTA = 50;

  const handleWheel = useCallback((e: WheelEvent) => {
    if (!containerRef.current) return;
    
    // Block all scrolling when locked
    if (scrollLocked) {
      e.preventDefault();
      return;
    }
    
    const isScrollingUp = e.deltaY < 0;
    const container = containerRef.current;
    
    // If animation is complete and we're at the top of the page content, 
    // capture scroll up to reverse the animation
    if (cameraAnimationComplete && isScrollingUp && container.scrollTop === 0) {
      e.preventDefault();
      
      // Clamp the scroll delta to limit speed
      const clampedDelta = Math.max(-MAX_SCROLL_DELTA, Math.min(MAX_SCROLL_DELTA, e.deltaY));
      
      // Update virtual scroll position
      virtualScrollY.current = Math.max(0, virtualScrollY.current + clampedDelta);
      
      // Calculate progress from virtual scroll
      const progress = virtualScrollY.current / SCROLL_THRESHOLD;
      
      setScrollProgress(progress);
      
      // Reset animation complete state when scrolling back
      if (progress < 1) {
        setCameraAnimationComplete(false);
      }
      return;
    }
    
    // During animation phase (not yet complete)
    if (!cameraAnimationComplete) {
      e.preventDefault();
      
      // Clamp the scroll delta to limit speed
      const clampedDelta = Math.max(-MAX_SCROLL_DELTA, Math.min(MAX_SCROLL_DELTA, e.deltaY));
      
      // Update virtual scroll position
      virtualScrollY.current = Math.max(0, Math.min(SCROLL_THRESHOLD, virtualScrollY.current + clampedDelta));
      
      // Calculate progress from virtual scroll
      const progress = virtualScrollY.current / SCROLL_THRESHOLD;
      
      setScrollProgress(progress);
      
      // When animation completes, lock scrolling for 1 second
      if (progress >= 1) {
        setScrollLocked(true);
        setCameraAnimationComplete(true);
        setTimeout(() => setScrollLocked(false), 1000);
      }
    }
    // Otherwise, allow normal page scrolling (when cameraAnimationComplete && scrolling down or not at top)
  }, [cameraAnimationComplete, scrollLocked]);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      // Reset scroll position on mount
      container.scrollTop = 0;
      // Use wheel event with passive: false to allow preventDefault
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  // Prevent body scroll when on Home page to avoid double scrollbars
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-[calc(100vh-65px)] bg-surface-950 overflow-x-hidden ${
        cameraAnimationComplete ? 'overflow-y-auto' : 'overflow-hidden'
      }`}
    >
      {/* Scrollable content wrapper */}
      <div className="relative" style={{ height: cameraAnimationComplete ? 'auto' : `calc(100vh - 65px + ${SCROLL_THRESHOLD}px)` }}>
        
        {/* Fixed viewport for the intro animation */}
        <div className={`${cameraAnimationComplete ? 'relative' : 'sticky top-0'} h-[calc(100vh-65px)] w-full`}>
          
          {/* Hero Section - Top centered */}
          <div 
            className="absolute top-8 left-0 right-0 z-30 flex justify-center transition-opacity duration-300"
          >
            <HeroContent />
          </div>
          
          {/* 3D Particle Background - Centered in remaining space */}
          <div className="absolute inset-0">
            <ParticleScene scrollProgress={scrollProgress} />
          </div>
          
          {/* Gradient overlays for depth */}
          <div className="absolute inset-0 bg-gradient-to-t from-surface-950 via-transparent to-surface-950/50 pointer-events-none z-10" />
          <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-surface-950/80 pointer-events-none z-10" />
          
          {/* Floating tool icons - positioned around particles */}
          <div className="absolute inset-0 top-32 z-20">
            <FloatingTools animationPaused={cameraAnimationComplete} />
          </div>
          
          {/* Subtle vignette effect */}
          <div className="absolute inset-0 pointer-events-none z-40"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 0%, transparent 50%, rgba(0,0,0,0.4) 100%)'
            }}
          />
          
          {/* Scroll indicator */}
          <div 
            className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 transition-opacity duration-300"
            style={{ opacity: cameraAnimationComplete ? 1 : (1 - scrollProgress * 2) }}
          >
            <span className="text-surface-400 text-sm">Scroll to explore</span>
            <div className="w-6 h-10 border-2 border-surface-400 rounded-full flex justify-center pt-2">
              <div className="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce" />
            </div>
          </div>
        </div>
        
        {/* Content that appears after camera animation */}
         <FeaturesSection />
      </div>
    </div>
  );
}
