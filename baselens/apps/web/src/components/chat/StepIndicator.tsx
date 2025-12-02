import { Check } from 'lucide-react';

export type StepStatus = 'pending' | 'running' | 'completed';

interface StepIndicatorProps {
    status: StepStatus;
}

export default function StepIndicator({ status }: StepIndicatorProps) {
    if (status === 'completed') {
        return (
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
            </div>
        );
    }

    if (status === 'running') {
        return (
            <div className="w-6 h-6 relative">
                <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24">
                    <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="white"
                        strokeWidth="2"
                        fill="none"
                    />
                    <path
                        className="opacity-75"
                        fill="none"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        d="M12 2a10 10 0 0 1 10 10"
                    />
                </svg>
            </div>
        );
    }

    // pending
    return (
        <div className="w-6 h-6 rounded-full border-2 border-white/60" />
    );
}
