import StepIndicator, { type StepStatus } from './StepIndicator';

export interface Step {
    label: string;
    status: StepStatus;
    result?: string;
}

interface StepsListProps {
    steps: Step[];
    isVisible: boolean;
}

export default function StepsList({ steps, isVisible }: StepsListProps) {
    if (!isVisible || steps.length === 0) return null;

    return (
        <div className="mt-6 w-[600px] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <h3 className="text-white font-medium mb-4">
                Here are the steps needed to complete your request:
            </h3>
            <div className="space-y-3">
                {steps.map((step, index) => (
                    <div
                        key={index}
                        className="flex items-center gap-3 text-white/80 text-sm"
                    >
                        <StepIndicator status={step.status} />
                        <span className="flex-1">{step.label}</span>
                        {step.result && (
                            <span className="text-primary-400 font-medium">{step.result}</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
