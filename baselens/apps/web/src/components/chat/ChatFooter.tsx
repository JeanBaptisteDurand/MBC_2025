import { useRef, useLayoutEffect } from 'react';
import gsap from 'gsap';

export default function ChatFooter() {
    const textRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const ctx = gsap.context(() => {
            gsap.from(textRef.current, { 
                opacity: 0, 
                y: 20, 
                duration: 1, 
                ease: "power3.out", 
                delay: 2 
            });
        }, textRef);
        return () => ctx.revert();
    }, []);

    return (
        <div ref={textRef} className="text-center space-y-2">
            <p className="text-xl md:text-2xl text-surface-300 font-light">
                Clarify digested the base blockchain.
            </p>
            <p className="text-lg md:text-xl text-primary-300 font-light">
                Ask it to perform any on chain actions.
            </p>
        </div>
    );
}
