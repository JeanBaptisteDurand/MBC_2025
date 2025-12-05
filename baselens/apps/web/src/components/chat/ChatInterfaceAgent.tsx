import { useRef, useState, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { useAccount, useWalletClient } from 'wagmi';
import { parseEther, parseUnits, encodeFunctionData } from 'viem';
import { baseSepolia } from 'viem/chains';
import LoadingDots from './LoadingDots';
import ChatInput from './ChatInput';
import StepsList, { type Step } from './StepsList';
import ExecutionList, { type ExecutionStep } from './ExecutionList';
import RequestSummary, { type SummaryCard } from './RequestSummary';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import { TREASURY_SWAP_ADDRESS, ERC20_ABI, USDC_ADDRESS_BASE_SEPOLIA } from '../../constants/treasurySwap';

// Register GSAP ScrollToPlugin
gsap.registerPlugin(ScrollToPlugin);

// Helper to scroll an element into view smoothly using GSAP, centered on screen
const scrollToElement = (element: HTMLElement | null, scrollContainer: HTMLElement | null) => {
    if (element && scrollContainer) {
        const elementRect = element.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();

        const elementCenter = element.offsetTop + elementRect.height / 2;
        const containerVisibleHeight = containerRect.height;
        const targetScroll = elementCenter - containerVisibleHeight / 2;

        gsap.to(scrollContainer, {
            scrollTo: { y: Math.max(0, targetScroll) },
            duration: 1.5,
            ease: "power2.out"
        });
    }
};

interface ChatInterfaceProps {
    isVisible: boolean;
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

export default function ChatInterfaceAgent({ isVisible }: ChatInterfaceProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const loadingDotsRef = useRef<HTMLDivElement>(null);
    const stepsListRef = useRef<HTMLDivElement>(null);
    const executionListRef = useRef<HTMLDivElement>(null);
    const summaryRef = useRef<HTMLDivElement>(null);

    const { address, isConnected } = useAccount();
    const { data: walletClient } = useWalletClient();
    const { user, isAuthenticated } = useAuth();

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
    const errorAlertShownRef = useRef<Set<string>>(new Set()); // Track which executions have shown errors
    const [executionError, setExecutionError] = useState<{ hasError: boolean; errorMessage?: string; transactionHistory?: SummaryCard[] }>({ hasError: false });

    // Summary state
    const [showSummary, setShowSummary] = useState(false);
    const [summaryCards, setSummaryCards] = useState<SummaryCard[]>([]);

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

    // Auto-scroll handlers
    useEffect(() => {
        if (isLoading) {
            scrollToElement(loadingDotsRef.current, getScrollContainer());
        }
    }, [isLoading]);

    useEffect(() => {
        if (showSteps && steps.length > 0) {
            scrollToElement(stepsListRef.current, getScrollContainer());
        }
    }, [showSteps, steps]);

    useEffect(() => {
        if (showExecution && executionSteps.length > 0) {
            scrollToElement(executionListRef.current, getScrollContainer());
        }
    }, [showExecution, executionSteps, currentExecutionStep]);

    useEffect(() => {
        if (showSummary) {
            scrollToElement(summaryRef.current, getScrollContainer());
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
            console.error('[ChatInterface] Plan generation failed:', error);
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
        // Normalize token to uppercase for comparison
        const tokenRaw = (parameters.token as string || '').toUpperCase();
        const token = tokenRaw === 'ETH' ? 'ETH' : tokenRaw === 'USDC' ? 'USDC' : null;
        const amount = parameters.amount as string;
        const to = parameters.to as string;

        if (!token) {
            throw new Error(`Unsupported token: ${parameters.token}. Only ETH and USDC are supported.`);
        }

        if (token === 'ETH') {
            // Send ETH
            const value = parseEther(amount);

            const hash = await walletClient.sendTransaction({
                to: to as `0x${string}`,
                value,
                chain: baseSepolia,
            });

            return hash;
        } else if (token === 'USDC') {
            // Send USDC - use the same pattern as Profile page (encodeFunctionData + sendTransaction)
            const usdcAddress = (USDC_ADDRESS_BASE_SEPOLIA) as `0x${string}`;
            const amountWei = parseUnits(amount, 6);

            // Encode the transfer function call
            const transferData = encodeFunctionData({
                abi: ERC20_ABI,
                functionName: 'transfer',
                args: [to as `0x${string}`, amountWei],
            });

            // Send transaction to USDC contract (same pattern as Profile page)
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
            console.error('[ChatInterface] Failed to start execution:', error);
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

            // Check if confirmation was successful
            if (!response.success) {
                const errorMessage = response.error || 'Step 0 confirmation failed';
                console.error('[ChatInterface] Step 0 confirmation failed:', errorMessage);
                throw new Error(errorMessage);
            }

            return response;
        } catch (error: any) {
            console.error('[ChatInterface] Failed to confirm Step 0:', error);
            // Extract error message from API error response
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

            // Update execution steps UI - filter out rollback step from main display
            // but include it at the end if it exists
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

            // Add rollback step at the end if it exists
            if (rollbackStep) {
                updatedSteps.push({
                    label: 'Returning user funds',
                    status: rollbackStep.status === 'completed' ? 'completed' :
                        rollbackStep.status === 'error' ? 'pending' : 'running',
                });
            }

            setExecutionSteps(updatedSteps);
            setCurrentExecutionStep(Math.min(state.currentStep, updatedSteps.length - 1));

            // Check if complete - only show success if ALL steps completed successfully
            if (state.isComplete) {
                if (executionPollInterval) {
                    clearInterval(executionPollInterval);
                    setExecutionPollInterval(null);
                }

                // Check if there were any errors
                const hasErrors = state.steps.some((s) => s.status === 'error');
                const allStepsCompleted = state.steps.every((s) =>
                    s.status === 'completed' || s.status === 'error'
                );

                // Only show success if all steps completed without errors
                if (!hasErrors && allStepsCompleted) {
                    // Build summary cards with transaction links
                    const txCards: SummaryCard[] = state.steps
                        .filter((s) => s.txHash)
                        .map((s) => ({
                            title: `Transaction ${s.stepId}`,
                            link: `${BASESCAN_URL}/tx/${s.txHash}`,
                            imageUrl: '/logo/basescan-light.svg',
                        }));

                    setSummaryCards(txCards);
                    setShowSummary(true);
                    setExecutionError({ hasError: false });
                } else if (hasErrors) {
                    // Check if rollback was attempted
                    const rollbackStep = state.steps.find((s) => s.stepId === 999);
                    const fundsReturned = rollbackStep?.status === 'completed';

                    // Don't show error alert if rollback is still in progress
                    if (rollbackStep && rollbackStep.status === 'running') {
                        // Still processing rollback, wait for it to complete
                        return;
                    }

                    // Build transaction history for transfer transactions (step 0 and step 999)
                    const transferSteps = state.steps.filter((s) => 
                        (s.stepId === 0 || s.stepId === 999) && s.txHash
                    );
                    const txHistory: SummaryCard[] = transferSteps.map((s) => {
                        const step = state.plan.steps.find((step: any) => step.stepId === s.stepId);
                        let title = '';
                        if (s.stepId === 0) {
                            title = 'Funding Transaction';
                        } else if (s.stepId === 999) {
                            title = 'Refund Transaction';
                        } else {
                            title = `Transaction ${s.stepId}`;
                        }
                        return {
                            title,
                            link: `${BASESCAN_URL}/tx/${s.txHash}`,
                            imageUrl: '/logo/basescan-light.svg',
                        };
                    });

                    // Set error state for UI
                    let errorMessage = state.error || 'Execution failed.';
                    if (fundsReturned) {
                        errorMessage += ' Your funds have been returned.';
                    } else if (rollbackStep?.status === 'error') {
                        errorMessage += ' Failed to return funds automatically. Please contact support.';
                    }

                    setExecutionError({
                        hasError: true,
                        errorMessage,
                        transactionHistory: txHistory.length > 0 ? txHistory : undefined,
                    });

                    // Show error message only once per execution (but don't use alert anymore)
                    if (!errorAlertShownRef.current.has(execId)) {
                        errorAlertShownRef.current.add(execId);
                        console.error('[ChatInterface] Execution failed:', state.error);
                    }
                }
            }
        } catch (error: any) {
            console.error('[ChatInterface] Failed to poll execution state:', error);
            // Stop polling if there's a network error
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
     * Process user message - main flow
     */
    const processMessage = async () => {
        if (!message.trim() || !isConnected || !isAuthenticated) {
            return;
        }

        setIsLoading(true);
        setShowSteps(false);
        setShowExecution(false);
        setShowSummary(false);
        setExecutionError({ hasError: false });

        try {
            // Step 1: Generate plan
            const plan = await generatePlan(message);
            if (!plan) {
                throw new Error('Failed to generate plan');
            }

            // Show planning steps with animation - convert plan steps to display format
            // Skip step 0 (funding) as it's shown separately in execution
            const planDisplaySteps: Step[] = plan.steps
                .filter((s) => s.stepId > 0) // Skip step 0 (funding)
                .map((step) => ({
                    label: getStepLabel(step.stepId, step),
                    status: 'pending' as const,
                }));

            // Start with empty steps, then animate them in one by one
            setSteps([]);
            setShowSteps(true);

            // Show plan steps appearing one by one with animation
            for (let i = 0; i < planDisplaySteps.length; i++) {
                await new Promise(resolve => setTimeout(resolve, 600)); // Delay between steps
                setSteps(prev => [
                    ...prev,
                    { ...planDisplaySteps[i], status: 'running' as const }
                ]);
                await new Promise(resolve => setTimeout(resolve, 500)); // Show running state
                setSteps(prev => prev.map((step, idx) =>
                    idx === i ? { ...step, status: 'completed' as const } : step
                ));
            }

            await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause before execution

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

                // Confirm with backend
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
                    console.error('[ChatInterface] Step 0 confirmation error:', error);
                    // Show error to user but continue polling - backend will handle it
                    setExecutionSteps((prev) =>
                        prev.map((s, idx) => (idx === 0 ? { ...s, status: 'pending' } : s))
                    );
                    // Don't throw - let polling continue so backend updates are shown
                }
            }

            // Step 5: Start polling for backend execution updates
            const interval = setInterval(() => {
                pollExecutionState(execId);
            }, 2000); // Poll every 2 seconds

            setExecutionPollInterval(interval);

            // Initial poll
            await pollExecutionState(execId);

            // Set a maximum poll time (5 minutes) to prevent infinite polling
            setTimeout(() => {
                if (executionPollInterval) {
                    clearInterval(executionPollInterval);
                    setExecutionPollInterval(null);
                    console.warn('[ChatInterface] Polling timeout - stopped after 5 minutes');
                }
            }, 5 * 60 * 1000);

        } catch (error: any) {
            console.error('[ChatInterface] Processing failed:', error);
            alert(error.message || 'Failed to process your request');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (message.trim() && !isLoading && !isSubmitted && isConnected && isAuthenticated) {
            setIsSubmitted(true);
            await processMessage();
        }
    };

    if (!isVisible) return null;

    if (!isConnected) {
        return (
            <div className="w-[600px] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                <div className="text-center text-surface-400 text-sm">
                    Please connect your wallet to use the agent.
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center">
            <div
                ref={containerRef}
                className="w-[600px] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden"
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
                    autoFocus={isVisible}
                />
            </div>

            <div ref={loadingDotsRef}>
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
                    hasError={executionError.hasError}
                    errorMessage={executionError.errorMessage}
                    transactionHistory={executionError.transactionHistory}
                />
            </div>

            <div ref={summaryRef}>
                <RequestSummary
                    isVisible={showSummary}
                    cards={summaryCards}
                    balanceUpdate={undefined}
                />
            </div>
        </div>
    );
}
