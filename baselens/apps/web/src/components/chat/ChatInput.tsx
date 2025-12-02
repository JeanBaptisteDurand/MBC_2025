import { useRef, useLayoutEffect } from 'react';

interface ChatInputProps {
    message: string;
    setMessage: (msg: string) => void;
    onSubmit: (e: React.FormEvent) => void;
    isSubmitted: boolean;
    isLoading: boolean;
    autoFocus?: boolean;
}

export default function ChatInput({
    message,
    setMessage,
    onSubmit,
    isSubmitted,
    isLoading,
    autoFocus = false,
}: ChatInputProps) {
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useLayoutEffect(() => {
        if (autoFocus) {
            const timer = setTimeout(() => {
                inputRef.current?.focus();
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [autoFocus]);

    const isDisabled = isSubmitted || isLoading || !message.trim();

    return (
        <form onSubmit={onSubmit} className="border-t border-white/10 p-4">
            <div className="flex gap-3">
                <textarea
                    ref={inputRef}
                    value={message}
                    readOnly={isSubmitted}
                    onChange={(e) => {
                        setMessage(e.target.value);
                        // Auto-resize textarea
                        e.target.style.height = 'auto';
                        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            onSubmit(e);
                        }
                    }}
                    placeholder="Ask Clarify anything about Base..."
                    rows={1}
                    className={`flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-surface-400 focus:outline-none focus:border-primary-400/50 focus:ring-1 focus:ring-primary-400/30 transition-all ${isSubmitted ? 'opacity-60 cursor-not-allowed' : ''}`}
                    style={{
                        maxHeight: '120px',
                        resize: 'none',
                        overflowY:
                            message.split('\n').length > 5 ||
                            (inputRef.current && inputRef.current.scrollHeight > 120)
                                ? 'auto'
                                : 'hidden',
                    }}
                />
                <button
                    type="submit"
                    disabled={isDisabled}
                    aria-disabled={isDisabled}
                    style={{
                        width: '46px',
                        height: '46px',
                        minWidth: '46px',
                        minHeight: '46px',
                        maxWidth: '46px',
                        maxHeight: '46px',
                    }}
                    className={`bg-primary-500 text-white rounded-xl font-medium transition-all duration-200 active:scale-95 flex items-center justify-center ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-400 hover:shadow-lg hover:shadow-primary-500/20'}`}
                >
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
                            d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                        />
                    </svg>
                </button>
            </div>
        </form>
    );
}
