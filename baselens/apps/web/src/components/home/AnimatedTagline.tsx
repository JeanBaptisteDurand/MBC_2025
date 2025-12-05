import { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';

const taglines = [
  'Your new vision of Base chain',
  'Blockchain clarified for anyone',
  'One ecosystem — endless possibilities',
];

export default function AnimatedTagline() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const textRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      // Animate out
      if (textRef.current) {
        gsap.to(textRef.current, {
          opacity: 0,
          y: -20,
          duration: 0.4,
          ease: 'power2.in',
          onComplete: () => {
            setCurrentIndex((prev) => (prev + 1) % taglines.length);
          },
        });
      }
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Animate in when text changes
  useEffect(() => {
    if (textRef.current) {
      gsap.fromTo(
        textRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }
      );
    }
  }, [currentIndex]);

  return (
    <div 
      ref={containerRef}
      className="h-8 flex items-center justify-center overflow-hidden"
    >
      <span
        ref={textRef}
        className="text-xl md:text-2xl text-surface-400 font-light"
      >
        {taglines[currentIndex]}
      </span>
    </div>
  );
}
