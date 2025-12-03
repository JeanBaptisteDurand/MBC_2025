import { useRef, useLayoutEffect } from 'react';
import gsap from 'gsap';
import AnimatedTagline from './AnimatedTagline';

export default function HeroContent() {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      // Title animation
      gsap.fromTo(
        titleRef.current,
        { opacity: 0, y: 30, scale: 0.95 },
        { 
          opacity: 1, 
          y: 0, 
          scale: 1,
          duration: 1,
          ease: 'power3.out',
          delay: 0.3
        }
      );

      // Subtitle animation
      gsap.fromTo(
        subtitleRef.current,
        { opacity: 0, y: 20 },
        { 
          opacity: 1, 
          y: 0, 
          duration: 0.8,
          ease: 'power2.out',
          delay: 0.6
        }
      );
    });

    return () => ctx.revert();
  }, []);

  return (
    <div className="relative z-20 text-center pointer-events-none select-none">
      {/* Main title */}
      <h1
        ref={titleRef}
        className="text-6xl md:text-8xl font-display font-bold mb-6 opacity-0"
      >
        <span className="text-white">Base</span>
        <span className="gradient-text">Lens</span>
      </h1>

      {/* Animated tagline */}
      <div ref={subtitleRef} className="opacity-0">
        <AnimatedTagline />
      </div>
    </div>
  );
}
