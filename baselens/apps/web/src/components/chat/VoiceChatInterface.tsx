import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import VoiceRecordButton from './VoiceRecordButton';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';

interface VoiceChatInterfaceProps {
  isVisible: boolean;
  onTranscription?: (text: string) => void;
  onSubmit?: (text: string) => void;
  autoSubmit?: boolean; // Automatically submit after transcription
  isProcessing?: boolean; // External processing state (after submit)
}

export default function VoiceChatInterface({ 
  isVisible, 
  onTranscription, 
  onSubmit,
  autoSubmit = false,
  isProcessing: externalProcessing = false,
}: VoiceChatInterfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const transcriptionRef = useRef<HTMLDivElement>(null);
  const hasSubmittedRef = useRef<boolean>(false);

  const {
    isRecording,
    isProcessing: isTranscribing,
    transcribedText,
    error,
    audioLevel,
    startRecording,
    stopRecording,
    reset: resetRecorder,
  } = useVoiceRecorder({
    onTranscription: (text) => {
      onTranscription?.(text);
    },
    onError: (err) => {
      console.error('[VoiceChatInterface] Error:', err);
    },
    maxDuration: 60000, // 60 seconds max
    silenceDuration: 2500, // Auto-stop after 2.5 seconds of silence
    autoStopOnSilence: true,
    noiseGateBuffer: 20, // Speech must be 20 points above ambient noise
  });

  // Combined processing state
  const isProcessing = isTranscribing || externalProcessing;

  // Reset submitted flag when recorder is reset
  const reset = () => {
    hasSubmittedRef.current = false;
    resetRecorder();
  };

  // Auto-submit after transcription is complete
  useEffect(() => {
    if (autoSubmit && transcribedText && !hasSubmittedRef.current && !isTranscribing) {
      hasSubmittedRef.current = true;
      // Small delay to show the transcribed text before submitting
      const timer = setTimeout(() => {
        onSubmit?.(transcribedText);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [autoSubmit, transcribedText, isTranscribing, onSubmit]);

  // Animate transcription appearance
  useEffect(() => {
    if (transcribedText && transcriptionRef.current) {
      gsap.fromTo(
        transcriptionRef.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }
      );
    }
  }, [transcribedText]);

  // Entrance animation
  useEffect(() => {
    if (isVisible && containerRef.current) {
      gsap.fromTo(
        containerRef.current,
        { opacity: 0, scale: 0.9 },
        { opacity: 1, scale: 1, duration: 0.5, ease: 'power3.out' }
      );
    }
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div
      ref={containerRef}
      className="w-[600px] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden"
      style={{
        boxShadow: '0 0 80px rgba(255,255,255,0.15)',
      }}
    >
      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <div className="text-center">
          <h3 className="text-lg font-medium text-white mb-1">Voice Interaction</h3>
          <p className="text-surface-400 text-sm">
            {isRecording
              ? 'Listening... Will auto-stop when you pause speaking'
              : isTranscribing
              ? 'Processing your voice...'
              : externalProcessing
              ? 'Processing your request...'
              : transcribedText && autoSubmit
              ? 'Starting your request...'
              : 'Click the microphone to start speaking'}
          </p>
        </div>
      </div>

      {/* Main content area */}
      <div className="p-8 flex flex-col items-center gap-6 min-h-[200px]">
        {/* Recording indicator / Waveform visualization */}
        {isRecording && (
          <div className="flex flex-col items-center gap-3">
            {/* Real-time audio level visualization */}
            <div className="flex items-end justify-center gap-1 h-12">
              {[...Array(7)].map((_, i) => {
                // Create a wave effect based on audio level
                const baseHeight = 8;
                const centerIndex = 3;
                const distanceFromCenter = Math.abs(i - centerIndex);
                const heightMultiplier = 1 - (distanceFromCenter * 0.15);
                const height = baseHeight + (audioLevel * 0.4 * heightMultiplier);
                
                return (
                  <div
                    key={i}
                    className="w-1.5 bg-gradient-to-t from-red-500 to-red-400 rounded-full transition-all duration-75"
                    style={{
                      height: `${Math.max(8, Math.min(48, height))}px`,
                    }}
                  />
                );
              })}
            </div>
            <span className="text-red-400 text-sm">Recording... Speak now</span>
          </div>
        )}

        {/* Processing indicator */}
        {isTranscribing && (
          <div className="flex items-center gap-2 text-primary-400">
            <svg
              className="animate-spin w-5 h-5"
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
            <span className="text-sm">Transcribing your speech...</span>
          </div>
        )}

        {/* Transcription result */}
        {transcribedText && !isRecording && !isTranscribing && (
          <div ref={transcriptionRef} className="w-full">
            <div className={`bg-white/5 border border-white/10 rounded-xl p-4 ${externalProcessing ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-4 h-4 text-primary-400"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-surface-400 mb-1">You said:</p>
                  <p className="text-white">{transcribedText}</p>
                </div>
              </div>
            </div>
            
            {/* Action buttons after transcription - only show if not auto-submitting or not processing */}
            {!autoSubmit && !externalProcessing && (
              <div className="flex justify-center gap-3 mt-4">
                <button
                  onClick={reset}
                  className="px-4 py-2 text-sm text-surface-300 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-colors"
                >
                  Record again
                </button>
                {onSubmit && (
                  <button
                    onClick={() => onSubmit(transcribedText)}
                    className="px-4 py-2 text-sm text-white bg-primary-500 hover:bg-primary-400 rounded-lg transition-colors"
                  >
                    Submit
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="w-full bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <div className="flex items-center gap-2 text-red-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
              <span className="text-sm">{error}</span>
            </div>
            <button
              onClick={reset}
              className="mt-3 text-sm text-red-400 hover:text-red-300 underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Initial state - instructions */}
        {!transcribedText && !error && !isRecording && !isProcessing && !externalProcessing && (
          <div className="text-center text-surface-400 text-sm">
            <p>Press the microphone button below to start speaking.</p>
            <p className="mt-1 text-surface-500 text-xs">
              Your voice will be transcribed to text.
            </p>
          </div>
        )}
      </div>

      {/* Footer with record button */}
      <div className="p-6 border-t border-white/10 flex justify-center">
        <VoiceRecordButton
          isRecording={isRecording}
          isProcessing={isProcessing}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          disabled={isProcessing || externalProcessing}
        />
      </div>
    </div>
  );
}
