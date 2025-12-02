import { useRef, useLayoutEffect } from 'react';
import gsap from 'gsap';

export default function BackgroundBlobs() {
  const bgBlobsRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      // Initial fade in
      gsap.from(bgBlobsRef.current, { opacity: 0, duration: 2, ease: "power2.inOut" });

      // Idle animation for background blobs
      gsap.to(".bg-blob", {
        x: "random(-50, 50)",
        y: "random(-50, 50)",
        scale: "random(0.8, 1.2)",
        duration: 10,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        stagger: {
            amount: 5,
            from: "random"
        }
      });
    }, bgBlobsRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={bgBlobsRef} className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="bg-blob absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary-600/10 rounded-full blur-[100px] mix-blend-screen"></div>
        <div className="bg-blob absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-accent-600/10 rounded-full blur-[120px] mix-blend-screen"></div>
        <div className="bg-blob absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-surface-800/30 rounded-full blur-[150px]"></div>
    </div>
  );
}
