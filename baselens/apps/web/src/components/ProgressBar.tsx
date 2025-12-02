import { cn } from "../utils/cn";

interface ProgressBarProps {
  progress: number;
  message?: string;
}

export default function ProgressBar({ progress, message }: ProgressBarProps) {
  return (
    <div className="space-y-4">
      {/* Message */}
      {message && (
        <p className="text-center text-surface-300 font-medium">
          {message}
        </p>
      )}

      {/* Progress Bar */}
      <div className="relative h-3 bg-surface-800 rounded-full overflow-hidden">
        <div
          className={cn(
            "absolute inset-y-0 left-0 bg-gradient-to-r from-primary-600 to-accent-500 rounded-full transition-all duration-500 ease-out",
            progress === 100 && "animate-pulse-glow"
          )}
          style={{ width: `${progress}%` }}
        />
        {/* Shimmer effect */}
        <div
          className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Progress Percentage */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-surface-500">Progress</span>
        <span className="text-primary-400 font-semibold">{progress}%</span>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center justify-center gap-2">
        <StepDot active={progress >= 0} completed={progress >= 20} label="Init" />
        <StepLine completed={progress >= 20} />
        <StepDot active={progress >= 20} completed={progress >= 40} label="On-chain" />
        <StepLine completed={progress >= 40} />
        <StepDot active={progress >= 40} completed={progress >= 70} label="Source" />
        <StepLine completed={progress >= 70} />
        <StepDot active={progress >= 70} completed={progress >= 90} label="AI" />
        <StepLine completed={progress >= 90} />
        <StepDot active={progress >= 90} completed={progress >= 100} label="Done" />
      </div>
    </div>
  );
}

function StepDot({
  active,
  completed,
  label,
}: {
  active: boolean;
  completed: boolean;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          "w-3 h-3 rounded-full border-2 transition-all duration-300",
          completed
            ? "bg-primary-500 border-primary-500"
            : active
            ? "border-primary-500 bg-transparent"
            : "border-surface-600 bg-transparent"
        )}
      />
      <span
        className={cn(
          "text-xs transition-colors",
          completed
            ? "text-primary-400"
            : active
            ? "text-surface-300"
            : "text-surface-600"
        )}
      >
        {label}
      </span>
    </div>
  );
}

function StepLine({ completed }: { completed: boolean }) {
  return (
    <div
      className={cn(
        "w-8 h-0.5 transition-colors duration-300 mb-5",
        completed ? "bg-primary-500" : "bg-surface-700"
      )}
    />
  );
}

