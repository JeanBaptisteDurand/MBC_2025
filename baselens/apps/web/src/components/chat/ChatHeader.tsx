import { useRef, useLayoutEffect, useState } from 'react';
import gsap from 'gsap';

interface ChatHeaderProps {
    isSplit: boolean;
}

export default function ChatHeader({ isSplit }: ChatHeaderProps) {
    const textRef = useRef<HTMLHeadingElement>(null);
    const [showInteractionTitle, setShowInteractionTitle] = useState(false);

    useLayoutEffect(() => {
        const ctx = gsap.context(() => {
            gsap.from(textRef.current, { 
                opacity: 0, 
                y: -30, 
                duration: 1, 
                ease: "power3.out", 
                delay: 1 
            });
        }, textRef);
        return () => ctx.revert();
    }, []);

    useLayoutEffect(() => {
        if (isSplit) {
            gsap.to(textRef.current, {
                opacity: 0,
                duration: 0.5,
                onComplete: () => {
                    setShowInteractionTitle(true);
                    gsap.to(textRef.current, {
                        opacity: 1,
                        duration: 0.5
                    });
                }
            });
        }
    }, [isSplit]);

    return (
        <h1 ref={textRef} className="text-4xl md:text-6xl font-thin tracking-tight text-center text-white/90 drop-shadow-2xl">
            {!showInteractionTitle ? (
                <>Hover the circle to meet <span className="font-normal text-white">Clarify</span></>
            ) : (
                "Choose your interaction mean"
            )}
        </h1>
    );
}
