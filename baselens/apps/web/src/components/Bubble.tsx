import { forwardRef, useRef, useImperativeHandle, HTMLAttributes } from 'react';
import gsap from 'gsap';
// import SmokeEffect from './SmokeEffect';

interface BubbleProps extends HTMLAttributes<HTMLDivElement> {}

const Bubble = forwardRef<HTMLDivElement, BubbleProps>((props, ref) => {
  const localRef = useRef<HTMLDivElement>(null);
  const { onMouseEnter, onMouseLeave, className, style, children, ...rest } = props;

  // Expose the DOM element to the parent
  useImperativeHandle(ref, () => localRef.current!);

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    gsap.to(localRef.current, { 
        scale: 1.15, 
        duration: 0.5, 
        ease: "back.out(1.7)",
        boxShadow: "0 0 100px rgba(255,255,255,0.4)"
    });
    onMouseEnter?.(e);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    gsap.to(localRef.current, { 
        scale: 1, 
        duration: 0.5, 
        ease: "power2.out",
        boxShadow: "0 0 50px rgba(255,255,255,0.1)"
    });
    onMouseLeave?.(e);
  };

  return (
    <div 
        ref={localRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`w-36 h-36 md:w-48 md:h-48 rounded-full cursor-pointer group transition-colors relative flex items-center justify-center ${className || ''}`}
        style={{
            boxShadow: "0 0 50px rgba(255,255,255,0.1)",
            ...style
        }}
        {...rest}
    >
        {/* Liquid Glass Bubble Container */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 overflow-hidden pointer-events-none">
            
            {/* Smoke Effect */}
            {/* <div className="absolute inset-0 opacity-60 mix-blend-screen">
                <SmokeEffect />
            </div> */}

            {/* Specular Highlight / Reflection */}
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/40 via-transparent to-transparent opacity-50 rounded-full"></div>
            
            {/* Inner Glow */}
            <div className="absolute inset-4 rounded-full bg-gradient-to-tl from-black/20 to-transparent blur-md"></div>
            
            {/* Bottom Reflection */}
            <div className="absolute bottom-10 right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
        </div>
        
        {/* Center "Core" */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-40 h-40 bg-white/5 rounded-full blur-2xl animate-pulse"></div>
        </div>

        {/* Content */}
        <div className="relative z-10 text-center pointer-events-none select-none">
            {children}
        </div>
    </div>
  );
});

export default Bubble;
