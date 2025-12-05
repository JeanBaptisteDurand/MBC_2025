import { useState, useRef, useCallback } from 'react';

export interface UseVoiceRecorderOptions {
  onTranscription?: (text: string) => void;
  onError?: (error: string) => void;
  maxDuration?: number; // Max recording duration in ms
  silenceDuration?: number; // Stop recording after this many ms of silence
  autoStopOnSilence?: boolean; // Enable auto-stop when user stops talking
  noiseGateBuffer?: number; // How much above ambient noise level counts as speech (0-100)
}

export interface UseVoiceRecorderReturn {
  isRecording: boolean;
  isProcessing: boolean;
  transcribedText: string | null;
  error: string | null;
  audioLevel: number; // Current audio level (0-100) for visualization
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  reset: () => void;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function useVoiceRecorder(options: UseVoiceRecorderOptions = {}): UseVoiceRecorderReturn {
  const { 
    onTranscription, 
    onError, 
    maxDuration = 60000,
    silenceDuration = 2000, // 2 seconds of silence before auto-stop
    autoStopOnSilence = true,
    noiseGateBuffer = 15, // Speech must be 15 points above ambient noise
  } = options;
  
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcribedText, setTranscribedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const hasSpokenRef = useRef<boolean>(false); // Track if user has started speaking
  const ambientNoiseLevelRef = useRef<number>(0); // Calibrated ambient noise level
  const calibrationSamplesRef = useRef<number[]>([]); // Samples for calibration

  const reset = useCallback(() => {
    setTranscribedText(null);
    setError(null);
    setIsRecording(false);
    setIsProcessing(false);
    setAudioLevel(0);
  }, []);

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    silenceStartRef.current = null;
    hasSpokenRef.current = false;
    ambientNoiseLevelRef.current = 0;
    calibrationSamplesRef.current = [];
    setAudioLevel(0);
  }, []);

  const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
    // Convert blob to base64
    const arrayBuffer = await audioBlob.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ''
      )
    );

    // Send to backend for transcription
    const response = await fetch(`${API_URL}/api/speech/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio: base64,
        mimeType: audioBlob.type || 'audio/webm',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Transcription failed');
    }

    const data = await response.json();
    return data.text;
  };

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setTranscribedText(null);
      silenceStartRef.current = null;
      hasSpokenRef.current = false;
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      });
      
      streamRef.current = stream;
      audioChunksRef.current = [];

      // Set up audio analysis for silence detection
      if (autoStopOnSilence) {
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;
        
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const CALIBRATION_SAMPLES = 10; // Number of samples for noise calibration
        const CALIBRATION_TIME = 500; // Calibrate for first 500ms
        const recordingStartTime = Date.now();
        
        // Function to analyze audio levels
        const checkAudioLevel = () => {
          if (!analyserRef.current || !mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
            return;
          }
          
          analyserRef.current.getByteFrequencyData(dataArray);
          
          // Calculate average volume level
          const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
          const normalizedLevel = Math.min(100, Math.round((average / 128) * 100));
          setAudioLevel(normalizedLevel);
          
          // Calibration phase: collect ambient noise samples
          const timeSinceStart = Date.now() - recordingStartTime;
          if (timeSinceStart < CALIBRATION_TIME) {
            calibrationSamplesRef.current.push(average);
            if (calibrationSamplesRef.current.length >= CALIBRATION_SAMPLES) {
              // Calculate ambient noise level (use 75th percentile to handle spikes)
              const sorted = [...calibrationSamplesRef.current].sort((a, b) => a - b);
              const percentile75Index = Math.floor(sorted.length * 0.75);
              ambientNoiseLevelRef.current = sorted[percentile75Index];
            }
            animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
            return;
          }
          
          // Dynamic threshold: ambient noise + buffer
          // Use minimum threshold of 10 to handle very quiet environments
          const dynamicThreshold = Math.max(10, ambientNoiseLevelRef.current + noiseGateBuffer);
          
          // Check if current level is below threshold (silence) or above (speech)
          const isSilent = average < dynamicThreshold;
          
          if (isSilent) {
            // Only start silence timer if user has already spoken
            if (hasSpokenRef.current) {
              if (silenceStartRef.current === null) {
                silenceStartRef.current = Date.now();
              } else if (Date.now() - silenceStartRef.current >= silenceDuration) {
                // Silence duration exceeded, stop recording
                if (mediaRecorderRef.current?.state === 'recording') {
                  mediaRecorderRef.current.stop();
                }
                return;
              }
            }
          } else {
            // User is speaking (level significantly above ambient noise)
            hasSpokenRef.current = true;
            silenceStartRef.current = null;
          }
          
          animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
        };
        
        // Start checking audio levels
        checkAudioLevel();
      }

      // Determine best supported mime type
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];
      
      let mimeType = '';
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined,
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsRecording(false);
        setIsProcessing(true);

        try {
          if (audioChunksRef.current.length === 0) {
            throw new Error('No audio recorded');
          }

          const audioBlob = new Blob(audioChunksRef.current, { 
            type: mimeType || 'audio/webm' 
          });

          const text = await transcribeAudio(audioBlob);
          setTranscribedText(text);
          onTranscription?.(text);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to transcribe audio';
          setError(errorMessage);
          onError?.(errorMessage);
        } finally {
          setIsProcessing(false);
          cleanup();
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);

      // Auto-stop after max duration
      timeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, maxDuration);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start recording';
      
      // Handle permission denied specifically
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please allow microphone access to use voice input.');
      } else {
        setError(errorMessage);
      }
      
      onError?.(errorMessage);
      cleanup();
    }
  }, [cleanup, maxDuration, noiseGateBuffer, silenceDuration, autoStopOnSilence, onError, onTranscription]);

  const stopRecording = useCallback(async () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  return {
    isRecording,
    isProcessing,
    transcribedText,
    error,
    audioLevel,
    startRecording,
    stopRecording,
    reset,
  };
}
