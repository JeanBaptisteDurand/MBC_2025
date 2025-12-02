import { useEffect, useState } from 'react';

interface LoadingDotsProps {
    isVisible: boolean;
}

export default function LoadingDots({ isVisible }: LoadingDotsProps) {
    const [activeDot, setActiveDot] = useState(0);

    useEffect(() => {
        if (!isVisible) return;

        const interval = setInterval(() => {
            setActiveDot((prev) => (prev + 1) % 3);
        }, 400);

        return () => clearInterval(interval);
    }, [isVisible]);

    if (!isVisible) return null;

    return (
        <div className="flex justify-center items-center gap-3 py-6">
            {[0, 1, 2].map((index) => (
                <div
                    key={index}
                    className="rounded-full transition-all duration-300 ease-out"
                    style={{
                        width: activeDot === index ? '14px' : '10px',
                        height: activeDot === index ? '14px' : '10px',
                        backgroundColor: activeDot === index ? '#fff' : 'rgba(255, 255, 255, 0.5)',
                        boxShadow: activeDot === index ? '0 0 12px rgba(255, 255, 255, 0.6)' : 'none',
                    }}
                />
            ))}
        </div>
    );
}
