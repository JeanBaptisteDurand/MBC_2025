import { useRef, useState, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import LoadingDots from './LoadingDots';
import ChatInput from './ChatInput';
import StepsList, { type Step } from './StepsList';
import ExecutionList, { type ExecutionStep } from './ExecutionList';
import RequestSummary, { type SummaryCard } from './RequestSummary';

// Register GSAP ScrollToPlugin
gsap.registerPlugin(ScrollToPlugin);

// Helper to scroll an element into view smoothly using GSAP, centered on screen
const scrollToElement = (element: HTMLElement | null, scrollContainer: HTMLElement | null) => {
    if (element && scrollContainer) {
        const elementRect = element.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();
        
        // Calculate the scroll position to center the element
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

// Mock steps data for planning phase
const initialSteps: Step[] = [
    { label: "Analyze the funds in your wallet", status: 'pending' },
    { label: "Find the best swap for ETH to USDC", status: 'pending' },
    { label: "Search a lending strategy on Morpho", status: 'pending' },
];

// Mock results for each step
const mockResults = [
    "0.5 ETH",
    "Uniswap V2 ETH-USDC",
    "Morpho Steakhouse USDC Vault"
];

// Mock execution steps data
const initialExecutionSteps: ExecutionStep[] = [
    { label: "Step 0: OnchainKit operation, sending ETH to agent wallet", status: 'pending' },
    { label: "Step 1: Swap ETH to USDC", status: 'pending' },
    { label: "Step 2: Lend USDC on Morpho", status: 'pending' },
    { label: "Step 3: Wait for transaction validation on blockchain", status: 'pending' },
	{label: "step 4: mock step 4", status: 'pending'},
	{label: "step 5: mock step 5", status: 'pending'},
	{label: "step 6: mock step 6", status: 'pending'},
];

// Mock wait times for each execution step (in ms)
const executionStepDelays = () => Math.floor(Math.random() * 1000) + 1000;

// Mock summary data
const mockSummaryCards: SummaryCard[] = [
    { title: "View your transactions on the blockchain", link: "https://basescan.org/", imageUrl: "/logo/basescan-light.svg" },
    { title: "View your funds in Morpho", link: "https://morpho.org/", imageUrl: "/logo/morpho.svg" },
];

const mockBalanceUpdate = {
    asset: "ETH",
    from: "0.5",
    to: "0.25",
    imageUrl: "/logo/eth.svg",
};

// Mock API call with 1.5 second delay
const mockStepApiCall = async (stepIndex: number): Promise<string> => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    return mockResults[stepIndex];
};

// Mock OnchainKit call - Step 0 is special, frontend calls OnchainKit
const mockOnchainKitCall = async (): Promise<boolean> => {
    await new Promise(resolve => setTimeout(resolve, executionStepDelays()));
    // Simulate successful OnchainKit operation
    return true;
};

// Mock backend execution step call
const mockExecutionStepCall = async (stepIndex: number): Promise<boolean> => {
    await new Promise(resolve => setTimeout(resolve, executionStepDelays()));
    return true;
};

export default function ChatInterface({ isVisible }: ChatInterfaceProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const loadingDotsRef = useRef<HTMLDivElement>(null);
    const stepsListRef = useRef<HTMLDivElement>(null);
    const executionListRef = useRef<HTMLDivElement>(null);
    const summaryRef = useRef<HTMLDivElement>(null);
    
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [steps, setSteps] = useState<Step[]>([]);
    const [showSteps, setShowSteps] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    
    // Execution state
    const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
    const [showExecution, setShowExecution] = useState(false);
    const [currentExecutionStep, setCurrentExecutionStep] = useState(0);
    
    // Summary state
    const [showSummary, setShowSummary] = useState(false);
    
    // Track which elements have already been scrolled to (only scroll once per element)
    const hasScrolledTo = useRef<Set<string>>(new Set());

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

    // Auto-scroll when loading dots appear (only once)
    useEffect(() => {
        if (isLoading && !hasScrolledTo.current.has('loading')) {
            hasScrolledTo.current.add('loading');
            scrollToElement(loadingDotsRef.current, getScrollContainer());
        }
        if (!isLoading) {
            hasScrolledTo.current.delete('loading');
        }
    }, [isLoading]);

    // Auto-scroll when steps list appears (only once)
    useEffect(() => {
        if (showSteps && steps.length > 0 && !hasScrolledTo.current.has('steps')) {
            hasScrolledTo.current.add('steps');
            scrollToElement(stepsListRef.current, getScrollContainer());
        }
    }, [showSteps, steps]);

    // Auto-scroll when execution list appears (only once)
    useEffect(() => {
        if (showExecution && executionSteps.length > 0 && !hasScrolledTo.current.has('execution')) {
            hasScrolledTo.current.add('execution');
            scrollToElement(executionListRef.current, getScrollContainer());
        }
    }, [showExecution, executionSteps]);

    // Auto-scroll when summary appears (only once)
    useEffect(() => {
        if (showSummary && !hasScrolledTo.current.has('summary')) {
            hasScrolledTo.current.add('summary');
            scrollToElement(summaryRef.current, getScrollContainer());
        }
    }, [showSummary]);

    // Process planning steps sequentially
    const processSteps = async () => {
        const stepsToProcess = [...initialSteps];
        setSteps(stepsToProcess);
        setShowSteps(true);

        for (let i = 0; i < stepsToProcess.length; i++) {
            // Set current step to running
            setSteps(prev => prev.map((step, idx) => 
                idx === i ? { ...step, status: 'running' as const } : step
            ));

            // Wait for mock API call
            const result = await mockStepApiCall(i);

            // Set step to completed with result
            setSteps(prev => prev.map((step, idx) => 
                idx === i ? { ...step, status: 'completed' as const, result } : step
            ));
        }
        
        // After planning is done, start execution
        await processExecution();
    };

    // Process execution steps
    const processExecution = async () => {
        const execSteps = [...initialExecutionSteps];
        setExecutionSteps(execSteps);
        setShowExecution(true);
        setCurrentExecutionStep(0);

        // Step 0: OnchainKit operation (special case - frontend calls OnchainKit)
        setExecutionSteps(prev => prev.map((step, idx) => 
            idx === 0 ? { ...step, status: 'running' as const } : step
        ));
        
        // Simulate OnchainKit call
        await mockOnchainKitCall();
        
        // Mark step 0 as completed and notify backend
        setExecutionSteps(prev => prev.map((step, idx) => 
            idx === 0 ? { ...step, status: 'completed' as const } : step
        ));

        // Process remaining steps (backend-driven)
        for (let i = 1; i < execSteps.length; i++) {
            setCurrentExecutionStep(i);
            
            // Set current step to running
            setExecutionSteps(prev => prev.map((step, idx) => 
                idx === i ? { ...step, status: 'running' as const } : step
            ));

            // Wait for mock backend call
            await mockExecutionStepCall(i);

            // Set step to completed
            setExecutionSteps(prev => prev.map((step, idx) => 
                idx === i ? { ...step, status: 'completed' as const } : step
            ));
        }
        
        // Show summary after all execution steps are completed
        setShowSummary(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (message.trim() && !isLoading && !isSubmitted) {
            // mark as submitted so input becomes non-editable and button disabled
            setIsSubmitted(true);
            setIsLoading(true);
            setSteps([]);
            setShowSteps(false);

            // Small delay before showing steps
            await new Promise(resolve => setTimeout(resolve, 500));
            setIsLoading(false);

            // Start processing steps
            await processSteps();

            // Do not clear the message after analysis finishes — keep it visible and non-editable
        }
    };

    if (!isVisible) return null;

    return (
		// Input section
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

            {/* Input Area */}
            <ChatInput
                message={message}
                setMessage={setMessage}
                onSubmit={handleSubmit}
                isSubmitted={isSubmitted}
                isLoading={isLoading}
                autoFocus={isVisible}
            />
            </div>

            {/* Loading Dots - outside the container */}
            <div ref={loadingDotsRef}>
                <LoadingDots isVisible={isLoading} />
            </div>

            {/* Steps container */}
            <div ref={stepsListRef}>
                <StepsList steps={steps} isVisible={showSteps} />
            </div>

            {/* Execution progress container */}
            <div ref={executionListRef}>
                <ExecutionList 
                    steps={executionSteps} 
                    isVisible={showExecution} 
                    currentStepIndex={currentExecutionStep}
                />
            </div>

            {/* Request summary */}
            <div ref={summaryRef}>
                <RequestSummary
                    isVisible={showSummary}
                    cards={mockSummaryCards}
                    balanceUpdate={mockBalanceUpdate}
                />
            </div>
        </div>
    );
}
