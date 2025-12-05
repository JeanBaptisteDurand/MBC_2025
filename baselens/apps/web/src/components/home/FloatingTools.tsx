import { useRef, useLayoutEffect, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MessageCircle, Code, BookOpen, Wallet, LucideIcon } from 'lucide-react';
import gsap from 'gsap';

interface Tool {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  position: { x: number; y: number };
  available: boolean;
  route?: string;
  expandDirection?: 'left' | 'right'; // Direction to expand on hover
}

const tools: Tool[] = [
  {
    id: 'analyze',
    name: 'Analyze',
    description: 'Smart contract analysis with AI-powered insights and visual graph representation',
    icon: Search,
    color: '#60a5fa',
    position: { x: -280, y: -120 },
    available: true,
    route: '/analyze',
    expandDirection: 'right',
  },
  {
    id: 'clarify',
    name: 'Clarify',
    description: 'AI assistant for frictionless on-chain transactions',
    icon: MessageCircle,
    color: '#a78bfa',
    position: { x: 280, y: -120 },
    available: true,
    route: '/chat',
    expandDirection: 'left',
  },
  {
    id: 'api',
    name: 'API',
    description: 'Developer APIs to integrate BaseLens into your applications',
    icon: Code,
    color: '#34d399',
    position: { x: -320, y: 20 },
    available: false,
    expandDirection: 'right',
  },
  {
    id: 'learn',
    name: 'Learn',
    description: 'E-Learning center for blockchain education',
    icon: BookOpen,
    color: '#fbbf24',
    position: { x: 0, y: 70 },
    available: false,
    expandDirection: 'right',
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    description: 'Automatic portfolio management powered by AI',
    icon: Wallet,
    color: '#f472b6',
    position: { x: 320, y: 20 },
    available: false,
    expandDirection: 'left',
  },
];

interface FloatingToolProps {
  tool: Tool;
  index: number;
  animationPaused?: boolean;
  positionScale: number;
}

function FloatingTool({ tool, index, animationPaused, positionScale }: FloatingToolProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const floatAnimation = useRef<gsap.core.Tween | null>(null);
  const expandTimeline = useRef<gsap.core.Timeline | null>(null);
  const navigate = useNavigate();

  const COLLAPSED_SIZE = 64; // 16 * 4 = 64px (w-16)
  const EXPANDED_WIDTH = 280;
  // Calculate expanded height based on description length (shorter descriptions need less height)
  const isShortDescription = tool.description.length < 55;
  const EXPANDED_HEIGHT = isShortDescription ? 85 : 120;
  
  // Apply scale to position
  const scaledPosition = {
    x: tool.position.x * positionScale,
    y: tool.position.y * positionScale,
  };

  // Initial floating animation
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    // Initial entrance animation
    gsap.fromTo(
      containerRef.current,
      { 
        opacity: 0, 
        scale: 0,
        y: scaledPosition.y + 50 
      },
      { 
        opacity: 1, 
        scale: 1,
        y: scaledPosition.y,
        duration: 0.8,
        delay: 0.2 + index * 0.1,
        ease: 'back.out(1.7)'
      }
    );

    // Continuous floating animation
    floatAnimation.current = gsap.to(containerRef.current, {
      y: scaledPosition.y + Math.sin(index) * 4,
      duration: 2 + index * 0.3,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });

    return () => {
      floatAnimation.current?.kill();
      expandTimeline.current?.kill();
    };
  }, [index, scaledPosition.y]);

  // Pause/resume animation and auto-expand/collapse based on animationPaused prop
  useLayoutEffect(() => {
    if (floatAnimation.current) {
      if (animationPaused) {
        gsap.to(floatAnimation.current, {
          timeScale: 0,
          duration: 0.3,
          ease: 'power2.out',
        });
      } else {
        gsap.to(floatAnimation.current, {
          timeScale: 1,
          duration: 0.3,
          ease: 'power2.in',
        });
      }
    }
    
    // Auto-expand when animation is paused, collapse when resumed
    if (containerRef.current && contentRef.current) {
      expandTimeline.current?.kill();
      expandTimeline.current = gsap.timeline();
      
      if (animationPaused) {
        // Expand with staggered delay based on index
        expandTimeline.current
          .to(containerRef.current, {
            width: EXPANDED_WIDTH,
            height: EXPANDED_HEIGHT,
            duration: 0.35,
            delay: index * 0.08,
            ease: 'power3.out',
          })
          .to(contentRef.current, {
            opacity: 1,
            duration: 0.2,
            ease: 'power2.out',
          }, '-=0.15');
      } else {
        // Collapse
        expandTimeline.current
          .to(contentRef.current, {
            opacity: 0,
            duration: 0.1,
            ease: 'power2.in',
          })
          .to(containerRef.current, {
            width: COLLAPSED_SIZE,
            height: COLLAPSED_SIZE,
            duration: 0.25,
            ease: 'power3.inOut',
          }, '-=0.05');
      }
    }
  }, [animationPaused, index]);

  const handleMouseEnter = () => {
    // Skip if already forcefully expanded
    if (animationPaused) return;
    
    // Slow down and pause the floating animation
    if (floatAnimation.current) {
      gsap.to(floatAnimation.current, {
        timeScale: 0,
        duration: 0.15,
        ease: 'power2.out',
      });
    }
    
    // Kill any ongoing expand animation
    expandTimeline.current?.kill();
    
    // Create expand timeline
    expandTimeline.current = gsap.timeline();
    
    if (containerRef.current && contentRef.current) {
      expandTimeline.current
        .to(containerRef.current, {
          width: EXPANDED_WIDTH,
          height: EXPANDED_HEIGHT,
          duration: 0.35,
          ease: 'power3.out',
        })
        .to(contentRef.current, {
          opacity: 1,
          duration: 0.2,
          ease: 'power2.out',
        }, '-=0.15');
    }
  };

  const handleMouseLeave = () => {
    // Skip if forcefully expanded - should stay open
    if (animationPaused) return;
    
    // Resume the floating animation only if not globally paused
    if (floatAnimation.current && !animationPaused) {
      gsap.to(floatAnimation.current, {
        timeScale: 1,
        duration: 0.3,
        ease: 'power2.in',
      });
    }
    
    // Kill any ongoing expand animation
    expandTimeline.current?.kill();
    
    // Create collapse timeline
    expandTimeline.current = gsap.timeline();
    
    if (containerRef.current && contentRef.current) {
      expandTimeline.current
        .to(contentRef.current, {
          opacity: 0,
          duration: 0.1,
          ease: 'power2.in',
        })
        .to(containerRef.current, {
          width: COLLAPSED_SIZE,
          height: COLLAPSED_SIZE,
          duration: 0.25,
          ease: 'power3.inOut',
        }, '-=0.05');
    }
  };

  const handleClick = () => {
    if (tool.available && tool.route) {
      navigate(tool.route);
    }
  };

  const Icon = tool.icon;

  return (
    <div
      className="absolute"
      style={{
        left: `calc(50% + ${scaledPosition.x}px)`,
        top: `calc(50% + ${scaledPosition.y}px)`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Expandable container */}
      <div
        ref={containerRef}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`
          relative rounded-2xl cursor-pointer overflow-hidden
          bg-gradient-to-br from-white/10 to-white/5
          backdrop-blur-xl border border-white/20
          ${!tool.available ? 'opacity-50' : ''}
        `}
        style={{
          width: COLLAPSED_SIZE,
          height: COLLAPSED_SIZE,
          boxShadow: `0 0 20px ${tool.color}20`,
        }}
      >
        {/* Icon - always visible on the left */}
        <div 
          className="absolute top-0 left-0 w-16 h-16 flex items-center justify-center flex-shrink-0"
        >
          <Icon 
            className="w-7 h-7" 
            style={{ color: tool.color }}
          />
        </div>
        
        {/* Expanded content */}
        <div
          ref={contentRef}
          className="absolute top-0 left-16 right-0 bottom-0 p-3 pl-1 opacity-0"
        >
          <h3 
            className="text-base font-semibold mb-1 whitespace-nowrap"
            style={{ color: tool.color }}
          >
            {tool.name}
            {!tool.available && (
              <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium bg-surface-800 rounded-full border border-surface-700 text-surface-400">
                Soon
              </span>
            )}
          </h3>
          <p className="text-xs text-surface-400 leading-relaxed line-clamp-3">
            {tool.description}
          </p>
        </div>
      </div>
    </div>
  );
}

interface FloatingToolsProps {
  animationPaused?: boolean;
}

export default function FloatingTools({ animationPaused }: FloatingToolsProps) {
  const [positionScale, setPositionScale] = useState(1);
  
  useEffect(() => {
    const calculateScale = () => {
      const width = window.innerWidth;
      // Full scale above 1100px, then scale down proportionally
      // At 600px width, scale to ~0.5
      if (width >= 1100) {
        setPositionScale(1);
      } else {
        // Linear interpolation from 1100px (scale 1) to 500px (scale 0.4)
        const scale = Math.max(0.4, 0.4 + (width - 500) * (0.6 / 600));
        setPositionScale(scale);
      }
    };
    
    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, []);
  
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="relative w-full h-full">
        {tools.map((tool, index) => (
          <div key={tool.id} className="pointer-events-auto">
            <FloatingTool tool={tool} index={index} animationPaused={animationPaused} positionScale={positionScale} />
          </div>
        ))}
      </div>
    </div>
  );
}
