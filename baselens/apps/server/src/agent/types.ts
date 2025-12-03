// ============================================
// Agent Planning and Execution Types
// ============================================

export type SupportedToken = "ETH" | "USDC";
export type SupportedAction =
  | "swap_eth_to_usdc"
  | "swap_usdc_to_eth"
  | "stake_eth"
  | "stake_usdc"
  | "unstake_eth"
  | "unstake_usdc"
  | "fund_agent"
  | "send_remaining";

export type StepType = "onchainkit" | "agentkit";

export interface PlanStep {
  stepId: number;
  type: StepType;
  action: SupportedAction;
  parameters: {
    token?: SupportedToken;
    amount?: string; // In human-readable format (e.g., "0.1", "100")
    amountWei?: string; // In wei/smallest unit format
    from?: string; // Address
    to?: string; // Address
    destination?: string; // For send_remaining
    label?: string; // Human-readable description
  };
}

export interface AgentPlan {
  isValid: boolean;
  error?: string;
  steps: PlanStep[];
  initialToken: SupportedToken;
  initialAmount: string;
  destinationAddress?: string; // Where to send remaining funds
}

export interface ExecutionStatus {
  stepId: number;
  status: "pending" | "running" | "completed" | "error";
  txHash?: string;
  error?: string;
  result?: string;
}

export interface ExecutionState {
  executionId: string;
  plan: AgentPlan;
  steps: ExecutionStatus[];
  currentStep: number;
  isComplete: boolean;
  error?: string;
  // Track original user amounts for rollback
  originalUserAmount?: {
    token: SupportedToken;
    amount: string; // Human-readable format
    amountWei: bigint; // In wei/smallest unit for precise tracking
  };
  // Track what user should receive (context balance)
  // After swaps, track what the user actually gets back
  userShouldReceive?: {
    ethAmount: bigint; // Amount of ETH user should receive
    usdcAmount: bigint; // Amount of USDC user should receive
  };
}
