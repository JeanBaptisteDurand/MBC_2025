import { useRef, useLayoutEffect, useState, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { useAccount, useWalletClient } from 'wagmi';
import { parseEther, parseUnits, encodeFunctionData } from 'viem';
import { baseSepolia } from 'viem/chains';
import Bubble from '../Bubble';
import VoiceChatInterface from './VoiceChatInterface';
import LoadingDots from './LoadingDots';
import ChatInput from './ChatInput';
import StepsList, { type Step } from './StepsList';
import ExecutionList, { type ExecutionStep } from './ExecutionList';
import RequestSummary, { type SummaryCard } from './RequestSummary';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import { ERC20_ABI, USDC_ADDRESS_BASE_SEPOLIA } from '../../constants/treasurySwap';

// Register GSAP ScrollToPlugin
gsap.registerPlugin(ScrollToPlugin);

interface InteractionBubblesProps {
    isSplit: boolean;
    onSplit: () => void;
    isChatMode: boolean;
    onChatMode: () => void;
    isVoiceMode: boolean;
    onVoiceMode: () => void;
}

interface PlanResponse {
    plan: {
        isValid: boolean;
        error?: string;
        steps: Array<{
            stepId: number;
            type: 'onchainkit' | 'agentkit';
            action: string;
            parameters: Record<string, any>;
        }>;
        initialToken: 'ETH' | 'USDC';
        initialAmount: string;
        destinationAddress?: string;
        agentWalletAddress: string;
    };
}

interface ExecutionState {
    executionId: string;
    plan: any;
    steps: Array<{
        stepId: number;
        status: 'pending' | 'running' | 'completed' | 'error';
        txHash?: string;
        error?: string;
        result?: string;
    }>;
    currentStep: number;
    isComplete: boolean;
    error?: string;
}

const BASESCAN_URL = 'https://sepolia.basescan.org';

// Helper to scroll to bottom of a container smoothly using GSAP
const scrollToBottom = (scrollContainer: HTMLElement | null) => {
    if (scrollContainer) {
        gsap.to(scrollContainer, {
            scrollTo: { y: scrollContainer.scrollHeight },
            duration: 0.8,
            ease: "power2.out"
        });
    }
};

export default function InteractionBubbles({ isSplit, onSplit, isChatMode, onChatMode, isVoiceMode, onVoiceMode }: InteractionBubblesProps) {
    const bubbleRef = useRef<HTMLDivElement>(null);
    const secondBubbleRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const chatInterfaceRef = useRef<HTMLDivElement>(null);
    const voiceInterfaceRef = useRef<HTMLDivElement>(null);
    const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
    const chatHoverTimerRef = useRef<NodeJS.Timeout | null>(null);
    const voiceHoverTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Refs for auto-scrolling
    const stepsListRef = useRef<HTMLDivElement>(null);
    const executionListRef = useRef<HTMLDivElement>(null);
    const summaryRef = useRef<HTMLDivElement>(null);
    
    // Track which sections have been scrolled to (only scroll once per section)
    const hasScrolledToSteps = useRef(false);
    const hasScrolledToExecution = useRef(false);
    const hasScrolledToSummary = useRef(false);

    // Wallet and auth state
    const { address, isConnected } = useAccount();
    const { data: walletClient } = useWalletClient();
    const { user, isAuthenticated } = useAuth();

    // Chat state - shared between text and voice modes
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [steps, setSteps] = useState<Step[]>([]);
    const [showSteps, setShowSteps] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);

    // Execution state
    const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
    const [showExecution, setShowExecution] = useState(false);
    const [currentExecutionStep, setCurrentExecutionStep] = useState(0);
    const [executionId, setExecutionId] = useState<string | null>(null);
    const [executionPollInterval, setExecutionPollInterval] = useState<NodeJS.Timeout | null>(null);
    const errorAlertShownRef = useRef<Set<string>>(new Set());

    // Summary state
    const [showSummary, setShowSummary] = useState(false);
    const [summaryCards, setSummaryCards] = useState<SummaryCard[]>([]);

    // Input source tracking
    const [inputSource, setInputSource] = useState<'text' | 'voice' | null>(null);

    // Find the scrollable parent container
    const getScrollContainer = (): HTMLElement | null => {
        let parent = containerRef.current?.parentElement;
        while (parent) {
            const style = window.getComputedStyle(parent);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                return parent;
            }
            parent = parent.parentElement;
        }
        return null;
    };

    // Scroll to bottom when steps appear (only once)
    useEffect(() => {
        if (showSteps && steps.length > 0 && !hasScrolledToSteps.current) {
            hasScrolledToSteps.current = true;
            scrollToBottom(getScrollContainer());
        }
    }, [showSteps, steps]);

    // Scroll to bottom when execution appears (only once)
    useEffect(() => {
        if (showExecution && executionSteps.length > 0 && !hasScrolledToExecution.current) {
            hasScrolledToExecution.current = true;
            scrollToBottom(getScrollContainer());
        }
    }, [showExecution, executionSteps]);

    // Scroll to bottom when summary appears (only once)
    useEffect(() => {
        if (showSummary && !hasScrolledToSummary.current) {
            hasScrolledToSummary.current = true;
            scrollToBottom(getScrollContainer());
        }
    }, [showSummary]);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (executionPollInterval) {
                clearInterval(executionPollInterval);
            }
        };
    }, [executionPollInterval]);

    /**
     * Call backend to generate plan
     */
    const generatePlan = async (userMessage: string): Promise<PlanResponse['plan'] | null> => {
        if (!address || !isAuthenticated) {
            throw new Error('Wallet not connected or not authenticated');
        }

        try {
            const response = await api.post<PlanResponse>('/api/agent/plan', {
                message: userMessage,
                userEOA: address,
                userSmartWallet: user?.smart_wallet_address || null,
            });

            if (!response.plan.isValid) {
                throw new Error(response.plan.error || 'Invalid plan generated');
            }

            return response.plan;
        } catch (error: any) {
            console.error('[InteractionBubbles] Plan generation failed:', error);
            throw error;
        }
    };

    /**
     * Execute Step 0 - Funding via OnchainKit
     */
    const executeStep0 = async (step0: PlanResponse['plan']['steps'][0]): Promise<string> => {
        if (!walletClient || !address) {
            throw new Error('Wallet not connected');
        }

        const { parameters } = step0;
        const tokenRaw = (parameters.token as string || '').toUpperCase();
        const token = tokenRaw === 'ETH' ? 'ETH' : tokenRaw === 'USDC' ? 'USDC' : null;
        const amount = parameters.amount as string;
        const to = parameters.to as string;

        if (!token) {
            throw new Error(`Unsupported token: ${parameters.token}. Only ETH and USDC are supported.`);
        }

        if (token === 'ETH') {
            const value = parseEther(amount);
            const hash = await walletClient.sendTransaction({
                to: to as `0x${string}`,
                value,
                chain: baseSepolia,
            });
            return hash;
        } else if (token === 'USDC') {
            const usdcAddress = (USDC_ADDRESS_BASE_SEPOLIA) as `0x${string}`;
            const amountWei = parseUnits(amount, 6);
            const transferData = encodeFunctionData({
                abi: ERC20_ABI,
                functionName: 'transfer',
                args: [to as `0x${string}`, amountWei],
            });
            const transferHash = await walletClient.sendTransaction({
                to: usdcAddress,
                data: transferData,
                chain: baseSepolia,
            });
            return transferHash;
        } else {
            throw new Error(`Unsupported token: ${token}`);
        }
    };

    /**
     * Start execution on backend
     */
    const startExecution = async (plan: PlanResponse['plan']): Promise<string> => {
        try {
            const response = await api.post<{ executionId: string; state: ExecutionState }>('/api/agent/execute', {
                plan,
            });
            return response.executionId;
        } catch (error: any) {
            console.error('[InteractionBubbles] Failed to start execution:', error);
            throw error;
        }
    };

    /**
     * Confirm Step 0 with backend
     */
    const confirmStep0WithBackend = async (
        execId: string,
        txHash: string,
        expectedToken: 'ETH' | 'USDC',
        expectedAmount: string
    ) => {
        try {
            const response = await api.post<{ success: boolean; state?: ExecutionState; error?: string }>('/api/agent/confirm-step0', {
                executionId: execId,
                txHash,
                expectedToken,
                expectedAmount,
            });

            if (!response.success) {
                const errorMessage = response.error || 'Step 0 confirmation failed';
                console.error('[InteractionBubbles] Step 0 confirmation failed:', errorMessage);
                throw new Error(errorMessage);
            }

            return response;
        } catch (error: any) {
            console.error('[InteractionBubbles] Failed to confirm Step 0:', error);
            const errorMessage = error?.message || error?.error || 'Failed to confirm Step 0';
            throw new Error(errorMessage);
        }
    };

    /**
     * Poll execution state from backend
     */
    const pollExecutionState = async (execId: string) => {
        try {
            const response = await api.get<{ state: ExecutionState }>(`/api/agent/execution/${execId}`);
            const state = response.state;

            const regularSteps = state.steps.filter((s) => s.stepId !== 999);
            const rollbackStep = state.steps.find((s) => s.stepId === 999);

            const updatedSteps: ExecutionStep[] = regularSteps.map((s) => {
                const step = state.plan.steps.find((step: any) => step.stepId === s.stepId);
                let status: 'pending' | 'running' | 'completed' = 'pending';
                if (s.status === 'completed') status = 'completed';
                else if (s.status === 'running') status = 'running';

                return {
                    label: getStepLabel(s.stepId, step),
                    status,
                };
            });

            if (rollbackStep) {
                updatedSteps.push({
                    label: 'Returning user funds',
                    status: rollbackStep.status === 'completed' ? 'completed' :
                        rollbackStep.status === 'error' ? 'pending' : 'running',
                });
            }

            setExecutionSteps(updatedSteps);
            setCurrentExecutionStep(Math.min(state.currentStep, updatedSteps.length - 1));

            if (state.isComplete) {
                if (executionPollInterval) {
                    clearInterval(executionPollInterval);
                    setExecutionPollInterval(null);
                }

                const hasErrors = state.steps.some((s) => s.status === 'error');
                const allStepsCompleted = state.steps.every((s) =>
                    s.status === 'completed' || s.status === 'error'
                );

                if (!hasErrors && allStepsCompleted) {
                    const txCards: SummaryCard[] = state.steps
                        .filter((s) => s.txHash)
                        .map((s) => ({
                            title: `Transaction ${s.stepId}`,
                            link: `${BASESCAN_URL}/tx/${s.txHash}`,
                            imageUrl: '/logo/basescan-light.svg',
                        }));

                    setSummaryCards(txCards);
                    setShowSummary(true);
                } else if (hasErrors) {
                    const rollbackStep = state.steps.find((s) => s.stepId === 999);
                    const fundsReturned = rollbackStep?.status === 'completed';

                    if (rollbackStep && rollbackStep.status === 'running') {
                        return;
                    }

                    if (!errorAlertShownRef.current.has(execId)) {
                        errorAlertShownRef.current.add(execId);
                        console.error('[InteractionBubbles] Execution failed:', state.error);

                        let errorMessage = state.error || 'Execution failed.';
                        if (fundsReturned) {
                            errorMessage += '\n\n✅ User funds have been returned.';
                        } else if (rollbackStep?.status === 'error') {
                            errorMessage += '\n\n⚠️ Failed to return funds automatically. Please contact support.';
                        } else {
                            errorMessage += '\n\nUser funds will be returned automatically.';
                        }

                        alert(errorMessage);
                    }
                }
            }
        } catch (error: any) {
            console.error('[InteractionBubbles] Failed to poll execution state:', error);
            if (executionPollInterval) {
                clearInterval(executionPollInterval);
                setExecutionPollInterval(null);
            }
        }
    };

    /**
     * Get human-readable label for step
     */
    const getStepLabel = (stepId: number, step: any): string => {
        if (!step) return `Step ${stepId}`;

        const { action, parameters } = step;

        switch (action) {
            case 'fund_agent':
                return `Send ${parameters.amount} ${parameters.token} to agent wallet`;
            case 'swap_eth_to_usdc':
                return 'Swap ETH to USDC';
            case 'swap_usdc_to_eth':
                return 'Swap USDC to ETH';
            case 'stake_eth':
                return 'Stake ETH';
            case 'stake_usdc':
                return 'Stake USDC';
            case 'send_remaining':
                return 'Send remaining funds to user';
            default:
                return step.parameters.label || `Step ${stepId}: ${action}`;
        }
    };

    /**
     * Process user message - main flow (shared between text and voice)
     */
    const processMessage = async (userMessage: string) => {
        if (!userMessage.trim() || !isConnected || !isAuthenticated) {
            return;
        }

        setIsLoading(true);
        setShowSteps(false);
        setShowExecution(false);
        setShowSummary(false);

        try {
            // Step 1: Generate plan
            const plan = await generatePlan(userMessage);
            if (!plan) {
                throw new Error('Failed to generate plan');
            }

            // Show planning steps with animation
            const planDisplaySteps: Step[] = plan.steps
                .filter((s) => s.stepId > 0)
                .map((step) => ({
                    label: getStepLabel(step.stepId, step),
                    status: 'pending' as const,
                }));

            setSteps([]);
            setShowSteps(true);

            for (let i = 0; i < planDisplaySteps.length; i++) {
                await new Promise(resolve => setTimeout(resolve, 600));
                setSteps(prev => [
                    ...prev,
                    { ...planDisplaySteps[i], status: 'running' as const }
                ]);
                await new Promise(resolve => setTimeout(resolve, 500));
                setSteps(prev => prev.map((step, idx) =>
                    idx === i ? { ...step, status: 'completed' as const } : step
                ));
            }

            await new Promise(resolve => setTimeout(resolve, 500));

            // Step 2: Start execution on backend
            const execId = await startExecution(plan);
            setExecutionId(execId);

            // Step 3: Prepare execution steps UI
            const execSteps: ExecutionStep[] = plan.steps.map((step) => ({
                label: getStepLabel(step.stepId, step),
                status: 'pending',
            }));

            setExecutionSteps(execSteps);
            setShowExecution(true);

            // Step 4: Execute Step 0 (OnchainKit)
            const step0 = plan.steps[0];
            if (step0.type === 'onchainkit' && step0.action === 'fund_agent') {
                setExecutionSteps((prev) =>
                    prev.map((s, idx) => (idx === 0 ? { ...s, status: 'running' } : s))
                );

                const txHash = await executeStep0(step0);

                try {
                    await confirmStep0WithBackend(
                        execId,
                        txHash,
                        step0.parameters.token as 'ETH' | 'USDC',
                        step0.parameters.amount as string
                    );

                    setExecutionSteps((prev) =>
                        prev.map((s, idx) => (idx === 0 ? { ...s, status: 'completed' } : s))
                    );
                } catch (error: any) {
                    console.error('[InteractionBubbles] Step 0 confirmation error:', error);
                    setExecutionSteps((prev) =>
                        prev.map((s, idx) => (idx === 0 ? { ...s, status: 'pending' } : s))
                    );
                }
            }

            // Step 5: Start polling for backend execution updates
            const interval = setInterval(() => {
                pollExecutionState(execId);
            }, 2000);

            setExecutionPollInterval(interval);
            await pollExecutionState(execId);

            setTimeout(() => {
                if (executionPollInterval) {
                    clearInterval(executionPollInterval);
                    setExecutionPollInterval(null);
                    console.warn('[InteractionBubbles] Polling timeout - stopped after 5 minutes');
                }
            }, 5 * 60 * 1000);

        } catch (error: any) {
            console.error('[InteractionBubbles] Processing failed:', error);
            alert(error.message || 'Failed to process your request');
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Handle text chat submit
     */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (message.trim() && !isLoading && !isSubmitted && isConnected && isAuthenticated) {
            setIsSubmitted(true);
            setInputSource('text');
            await processMessage(message);
        }
    };

    /**
     * Handle voice transcription submit
     */
    const handleVoiceSubmit = async (transcribedText: string) => {
        if (transcribedText.trim() && !isLoading && !isSubmitted && isConnected && isAuthenticated) {
            setMessage(transcribedText);
            setIsSubmitted(true);
            setInputSource('voice');
            await processMessage(transcribedText);
        }
    };

    // Voice bubble hover - triggers voice mode
    const handleBubbleMouseEnter = () => {
        if (isSplit) {
            // When split, hovering on voice bubble triggers voice mode
            if (isVoiceMode || isChatMode) return;
            voiceHoverTimerRef.current = setTimeout(() => {
                onVoiceMode();
            }, 1000);
        } else {
            // Before split, hovering triggers the split
            hoverTimerRef.current = setTimeout(() => {
                onSplit();
            }, 1000);
        }
    };

    const handleBubbleMouseLeave = () => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
        if (voiceHoverTimerRef.current) {
            clearTimeout(voiceHoverTimerRef.current);
            voiceHoverTimerRef.current = null;
        }
    };

    const handleChatBubbleMouseEnter = () => {
        if (isChatMode) return;
        chatHoverTimerRef.current = setTimeout(() => {
            onChatMode();
        }, 1000);
    };

    const handleChatBubbleMouseLeave = () => {
        if (chatHoverTimerRef.current) {
            clearTimeout(chatHoverTimerRef.current);
            chatHoverTimerRef.current = null;
        }
    };

    useLayoutEffect(() => {
        const ctx = gsap.context(() => {
            // Initial entrance for main bubble
            gsap.from(bubbleRef.current, {
                scale: 0,
                opacity: 0,
                duration: 1.5,
                ease: "elastic.out(1, 0.5)",
                delay: 1.5
            });

            // Idle animation
            gsap.to(bubbleRef.current, {
                y: 15,
                duration: 3,
                repeat: -1,
                yoyo: true,
                ease: "sine.inOut"
            });
        }, containerRef);
        return () => ctx.revert();
    }, []);

    // Split animation when bubbles separate
    useLayoutEffect(() => {
        if (isSplit && !isChatMode && !isVoiceMode && bubbleRef.current && secondBubbleRef.current) {
            const ctx = gsap.context(() => {
                gsap.killTweensOf(bubbleRef.current);

                gsap.to(bubbleRef.current, {
                    x: -150,
                    y: 0,
                    duration: 1,
                    ease: "power3.out"
                });

                gsap.fromTo(secondBubbleRef.current,
                    { x: 0, scale: 0, opacity: 0 },
                    {
                        x: 150,
                        scale: 1,
                        opacity: 1,
                        duration: 1,
                        ease: "power3.out"
                    }
                );
            }, containerRef);
            return () => ctx.revert();
        }
    }, [isSplit, isChatMode, isVoiceMode]);

    // Chat mode transformation animation
    useLayoutEffect(() => {
        if (isChatMode && secondBubbleRef.current && chatInterfaceRef.current) {
            const ctx = gsap.context(() => {
                // Kill any existing tweens
                gsap.killTweensOf(bubbleRef.current);
                gsap.killTweensOf(secondBubbleRef.current);

                // Fade out the voice bubble
                gsap.to(bubbleRef.current, {
                    opacity: 0,
                    scale: 0.5,
                    duration: 0.5,
                    ease: "power2.in"
                });

                // Transform chat bubble into rectangle
                gsap.to(secondBubbleRef.current, {
                    opacity: 0,
                    scale: 0.8,
                    duration: 0.3,
                    ease: "power2.in"
                });

                // Animate in the chat interface
                gsap.fromTo(chatInterfaceRef.current,
                    {
                        opacity: 0,
                        scale: 0.8,
                        y: 20
                    },
                    {
                        opacity: 1,
                        scale: 1,
                        y: 0,
                        duration: 0.6,
                        delay: 0.3,
                        ease: "power3.out"
                    }
                );
            }, containerRef);
            return () => ctx.revert();
        }
    }, [isChatMode]);

    // Voice mode transformation animation
    useLayoutEffect(() => {
        if (isVoiceMode && bubbleRef.current && voiceInterfaceRef.current) {
            const ctx = gsap.context(() => {
                // Kill any existing tweens
                gsap.killTweensOf(bubbleRef.current);
                gsap.killTweensOf(secondBubbleRef.current);

                // Fade out both bubbles
                gsap.to(bubbleRef.current, {
                    opacity: 0,
                    scale: 0.5,
                    duration: 0.5,
                    ease: "power2.in"
                });

                gsap.to(secondBubbleRef.current, {
                    opacity: 0,
                    scale: 0.5,
                    duration: 0.5,
                    ease: "power2.in"
                });

                // Animate in the voice interface
                gsap.fromTo(voiceInterfaceRef.current,
                    {
                        opacity: 0,
                        scale: 0.8,
                        y: 20
                    },
                    {
                        opacity: 1,
                        scale: 1,
                        y: 0,
                        duration: 0.6,
                        delay: 0.3,
                        ease: "power3.out"
                    }
                );
            }, containerRef);
            return () => ctx.revert();
        }
    }, [isVoiceMode]);

    const isInInterfaceMode = isChatMode || isVoiceMode;

    // Show wallet connect message if not connected (for both modes)
    const renderWalletMessage = () => (
        <div className="w-[600px] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="text-center text-surface-400 text-sm">
                Please connect your wallet to use the agent.
            </div>
        </div>
    );

    // Render the text chat input interface
    const renderChatInterface = () => (
        <div
            ref={chatInterfaceRef}
            className="w-full"
        >
            <div className="w-[600px] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden"
                style={{
                    boxShadow: "0 0 80px rgba(255,255,255,0.15)"
                }}
            >
                <div className="p-6 overflow-y-auto">
                    <div className="text-center text-surface-400 text-sm">
                        Write down instructions for Clarify to follow.
                    </div>
                </div>

                <ChatInput
                    message={message}
                    setMessage={setMessage}
                    onSubmit={handleSubmit}
                    isSubmitted={isSubmitted}
                    isLoading={isLoading}
                    autoFocus={isChatMode}
                />
            </div>
        </div>
    );

    // Render the voice interface
    const renderVoiceInterface = () => (
        <div
            ref={voiceInterfaceRef}
            className="w-full"
        >
            <VoiceChatInterface 
                isVisible={isVoiceMode}
                onSubmit={handleVoiceSubmit}
                autoSubmit={true}
                isProcessing={isLoading || showSteps || showExecution}
            />
        </div>
    );

    // Render the shared processing UI (loading, steps, execution, summary)
    const renderProcessingUI = () => (
        <>
            <div>
                <LoadingDots isVisible={isLoading} />
            </div>

            <div ref={stepsListRef}>
                <StepsList steps={steps} isVisible={showSteps} />
            </div>

            <div ref={executionListRef}>
                <ExecutionList
                    steps={executionSteps}
                    isVisible={showExecution}
                    currentStepIndex={currentExecutionStep}
                />
            </div>

            <div ref={summaryRef}>
                <RequestSummary
                    isVisible={showSummary}
                    cards={summaryCards}
                    balanceUpdate={undefined}
                />
            </div>
        </>
    );

    return (
        <div ref={containerRef} className={`relative flex justify-center items-center ${isInInterfaceMode ? 'w-[600px]' : 'w-36 h-36 md:w-48 md:h-48'}`}>
            {!isInInterfaceMode && (
                <>
                    <div className="absolute flex justify-center items-center">
                        <Bubble
                            ref={bubbleRef}
                            onMouseEnter={handleBubbleMouseEnter}
                            onMouseLeave={handleBubbleMouseLeave}
                        >
                            <span className={`text-sm font-medium transition-opacity duration-500 ${isSplit ? 'opacity-100' : 'opacity-0'}`}>
                                Start voice interaction
                            </span>
                        </Bubble>
                    </div>
                    {isSplit && (
                        <div className="absolute flex justify-center items-center">
                            <Bubble
                                ref={secondBubbleRef}
                                onMouseEnter={handleChatBubbleMouseEnter}
                                onMouseLeave={handleChatBubbleMouseLeave}
                            >
                                <span className="text-sm font-medium">
                                    Start text chat interaction
                                </span>
                            </Bubble>
                        </div>
                    )}
                </>
            )}

            {/* Chat Interface - shown when in chat mode */}
            {isChatMode && (
                <div className="flex flex-col items-center">
                    {!isConnected ? renderWalletMessage() : renderChatInterface()}
                    {isConnected && renderProcessingUI()}
                </div>
            )}

            {/* Voice Interface - shown when in voice mode */}
            {isVoiceMode && (
                <div className="flex flex-col items-center">
                    {!isConnected ? renderWalletMessage() : renderVoiceInterface()}
                    {isConnected && renderProcessingUI()}
                </div>
            )}
        </div>
    );
}
