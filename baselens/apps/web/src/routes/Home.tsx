import { useState, useEffect, useRef } from 'react';
import ParticleScene from '../components/home/ParticleScene';
import FloatingTools from '../components/home/FloatingTools';
import HeroContent from '../components/home/HeroContent';

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [cameraAnimationComplete, setCameraAnimationComplete] = useState(false);

  // Scroll threshold where camera animation completes (in pixels)
  const SCROLL_THRESHOLD = 800;

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      
      const scrollY = containerRef.current.scrollTop;
      const progress = Math.min(scrollY / SCROLL_THRESHOLD, 1);
      
      setScrollProgress(progress);
      setCameraAnimationComplete(progress >= 1);
      
      // Debug logging
      console.log('Scroll Progress:', progress.toFixed(2), 'ScrollY:', scrollY);
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-[calc(100vh-65px)] bg-surface-950 overflow-y-auto overflow-x-hidden"
    >
      {/* Scrollable content wrapper */}
      <div className="relative" style={{ height: cameraAnimationComplete ? 'auto' : `calc(100vh - 65px + ${SCROLL_THRESHOLD}px)` }}>
        
        {/* Fixed viewport for the intro animation */}
        <div className={`${cameraAnimationComplete ? 'relative' : 'sticky top-0'} h-[calc(100vh-65px)] w-full`}>
          
          {/* Hero Section - Top centered */}
          <div 
            className="absolute top-8 left-0 right-0 z-30 flex justify-center transition-opacity duration-300"
            style={{ opacity: 1 - scrollProgress * 0.8 }}
          >
            <HeroContent />
          </div>
          
          {/* 3D Particle Background - Centered in remaining space */}
          <div className="absolute inset-0 top-32">
            <ParticleScene scrollProgress={scrollProgress} />
          </div>
          
          {/* Gradient overlays for depth */}
          <div className="absolute inset-0 bg-gradient-to-t from-surface-950 via-transparent to-surface-950/50 pointer-events-none z-10" />
          <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-surface-950/80 pointer-events-none z-10" />
          
          {/* Floating tool icons - positioned around particles */}
          <div 
            className="absolute inset-0 top-32 z-20 transition-opacity duration-300"
            style={{ opacity: 1 - scrollProgress * 0.9 }}
          >
            <FloatingTools />
          </div>
          
          {/* Subtle vignette effect */}
          <div className="absolute inset-0 pointer-events-none z-40"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 0%, transparent 50%, rgba(0,0,0,0.4) 100%)'
            }}
          />
          
          {/* Scroll indicator */}
          {!cameraAnimationComplete && (
            <div 
              className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 transition-opacity duration-300"
              style={{ opacity: 1 - scrollProgress * 2 }}
            >
              <span className="text-surface-400 text-sm">Scroll to explore</span>
              <div className="w-6 h-10 border-2 border-surface-400 rounded-full flex justify-center pt-2">
                <div className="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce" />
              </div>
            </div>
          )}
        </div>
        
        {/* Content that appears after camera animation */}
        {cameraAnimationComplete && (
          <div className="relative z-50 bg-surface-950 min-h-screen pt-20">
            <div className="max-w-4xl mx-auto px-6">
              <h2 className="text-3xl font-bold text-white mb-6">Welcome Inside</h2>
              <p className="text-surface-400">You've entered the BaseLens universe. More content coming soon...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
