import { Check } from 'lucide-react';
import FailureAnimation from './FailureAnimation';
import { SummaryCard } from './RequestSummary';

export type ExecutionStepStatus = 'pending' | 'running' | 'completed';

export interface ExecutionStep {
    label: string;
    status: ExecutionStepStatus;
}

interface ExecutionListProps {
    steps: ExecutionStep[];
    isVisible: boolean;
    currentStepIndex: number;
    hasError?: boolean;
    errorMessage?: string;
    transactionHistory?: SummaryCard[];
}

function ProgressStepIndicator({ status, stepNumber }: { status: ExecutionStepStatus; stepNumber: number }) {
    if (status === 'completed') {
        return (
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center z-10">
                <Check className="w-4 h-4 text-white" strokeWidth={3} />
            </div>
        );
    }

    if (status === 'running') {
        return (
            <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center z-10 animate-pulse">
                <span className="text-white text-sm font-medium">{stepNumber}</span>
            </div>
        );
    }

    // pending
    return (
        <div className="w-8 h-8 rounded-full border-2 border-white/40 bg-white/5 flex items-center justify-center z-10">
            <span className="text-white/60 text-sm">{stepNumber}</span>
        </div>
    );
}

export default function ExecutionList({ 
    steps, 
    isVisible, 
    currentStepIndex,
    hasError = false,
    errorMessage,
    transactionHistory
}: ExecutionListProps) {
    if (!isVisible || steps.length === 0) return null;

    // Show failure animation if there's an error
    if (hasError) {
        return (
            <FailureAnimation 
                errorMessage={errorMessage}
                transactionHistory={transactionHistory}
            />
        );
    }

    const completedCount = steps.filter(s => s.status === 'completed').length;
    const progressPercentage = (completedCount / steps.length) * 100;
    const currentStep = steps[currentStepIndex] || steps[steps.length - 1];

    return (
        <div className="mt-6 w-[600px] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <h3 className="text-white font-medium mb-2">
                Executing your request:
            </h3>
            
            {/* Current step description */}
            <p className="text-white/80 text-sm mb-6">
                {currentStep?.status === 'completed' && currentStepIndex === steps.length - 1
                    ? '✓ All steps completed successfully!'
                    : currentStep?.label}
            </p>

            {/* Progress bar container */}
            <div className="relative mb-4">
                {/* Background track */}
                <div className="absolute top-1/2 left-4 right-4 h-1 bg-white/20 -translate-y-1/2 rounded-full" />
                
                {/* Progress fill */}
                <div 
                    className="absolute top-1/2 left-4 h-1 bg-green-500 -translate-y-1/2 rounded-full transition-all duration-500"
                    style={{ width: `calc(${progressPercentage}% - 32px)` }}
                />

                {/* Step indicators */}
                <div className="flex justify-between items-center relative">
                    {steps.map((step, index) => (
                        <ProgressStepIndicator 
                            key={index} 
                            status={step.status} 
                            stepNumber={index} 
                        />
                    ))}
                </div>
            </div>

            {/* Step labels below */}
            <div className="flex justify-between text-xs text-white/60 mt-2">
                {steps.map((step, index) => (
                    <div 
                        key={index} 
                        className={`w-8 text-center ${step.status === 'running' ? 'text-primary-400' : ''} ${step.status === 'completed' ? 'text-green-400' : ''}`}
                    >
                        {index}
                    </div>
                ))}
            </div>

            {/* Detailed step list */}
            <div className="mt-6 space-y-2 border-t border-white/10 pt-4">
                {steps.map((step, index) => (
                    <div
                        key={index}
                        className={`flex items-center gap-3 text-sm transition-opacity ${
                            step.status === 'pending' ? 'text-white/40' : 
                            step.status === 'running' ? 'text-white' : 
                            'text-green-400'
                        }`}
                    >
                        <span className="w-4 text-center">
                            {step.status === 'completed' ? '✓' : 
                             step.status === 'running' ? '→' : '○'}
                        </span>
                        <span>{step.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
