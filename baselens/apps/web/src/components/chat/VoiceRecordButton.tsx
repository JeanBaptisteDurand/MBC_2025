import { useRef, useEffect } from 'react';
import gsap from 'gsap';

interface VoiceRecordButtonProps {
  isRecording: boolean;
  isProcessing: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  disabled?: boolean;
}

export default function VoiceRecordButton({
  isRecording,
  isProcessing,
  onStartRecording,
  onStopRecording,
  disabled = false,
}: VoiceRecordButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pulseRef = useRef<HTMLDivElement>(null);
  const waveRef1 = useRef<HTMLDivElement>(null);
  const waveRef2 = useRef<HTMLDivElement>(null);
  const waveRef3 = useRef<HTMLDivElement>(null);

  // Recording pulse animation
  useEffect(() => {
    if (isRecording && pulseRef.current) {
      gsap.to(pulseRef.current, {
        scale: 1.5,
        opacity: 0,
        duration: 1,
        repeat: -1,
        ease: 'power2.out',
      });
    } else if (pulseRef.current) {
      gsap.killTweensOf(pulseRef.current);
      gsap.set(pulseRef.current, { scale: 1, opacity: 0.5 });
    }
  }, [isRecording]);

  // Sound wave animation for recording
  useEffect(() => {
    const waves = [waveRef1.current, waveRef2.current, waveRef3.current];
    
    if (isRecording) {
      waves.forEach((wave, index) => {
        if (wave) {
          gsap.to(wave, {
            scaleY: 1 + Math.random() * 0.5,
            duration: 0.2 + index * 0.1,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
          });
        }
      });
    } else {
      waves.forEach((wave) => {
        if (wave) {
          gsap.killTweensOf(wave);
          gsap.to(wave, { scaleY: 1, duration: 0.2 });
        }
      });
    }
  }, [isRecording]);

  // Button press animation
  const handleClick = () => {
    if (disabled) return;

    if (buttonRef.current) {
      gsap.to(buttonRef.current, {
        scale: 0.95,
        duration: 0.1,
        yoyo: true,
        repeat: 1,
      });
    }

    if (isRecording) {
      onStopRecording();
    } else {
      onStartRecording();
    }
  };

  const isDisabled = disabled || isProcessing;

  return (
    <div className="relative flex items-center justify-center">
      {/* Pulse ring - only visible when recording */}
      <div
        ref={pulseRef}
        className={`absolute w-12 h-12 rounded-full bg-red-500/50 ${
          isRecording ? 'opacity-50' : 'opacity-0'
        }`}
      />

      {/* Main button */}
      <button
        ref={buttonRef}
        onClick={handleClick}
        disabled={isDisabled}
        className={`
          relative z-10 w-12 h-12 rounded-full flex items-center justify-center
          transition-all duration-200
          ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}
          ${isRecording 
            ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30' 
            : 'bg-primary-500 hover:bg-primary-400 shadow-lg shadow-primary-500/20'
          }
        `}
        title={isRecording ? 'Stop recording' : 'Start recording'}
      >
        {isProcessing ? (
          // Processing spinner
          <svg
            className="animate-spin w-5 h-5 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : isRecording ? (
          // Sound waves when recording
          <div className="flex items-center gap-0.5">
            <div
              ref={waveRef1}
              className="w-1 h-4 bg-white rounded-full origin-center"
            />
            <div
              ref={waveRef2}
              className="w-1 h-6 bg-white rounded-full origin-center"
            />
            <div
              ref={waveRef3}
              className="w-1 h-4 bg-white rounded-full origin-center"
            />
          </div>
        ) : (
          // Microphone icon
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-5 h-5 text-white"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
