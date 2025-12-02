import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { baseSepolia } from "viem/chains";
import { createPublicClient, http, parseAbiItem } from "viem";
import { Wallet, Calendar, Coins, FileText, ExternalLink } from "lucide-react";
import { shortenAddress, getBasescanTxUrl } from "../utils/explorers";
import { cn } from "../utils/cn";

const PAY_CONTRACT_ADDRESS = "0x3A7F370D0C105Afc23800253504656ae99857bde" as const;

// ABI for PaymentReceived event
const paymentReceivedAbi = parseAbiItem(
  "event PaymentReceived(address indexed payer, uint256 amount, uint256 timestamp, string text)"
);

// Create public client for Base Sepolia
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

interface PaymentEvent {
  payer: string;
  amount: bigint;
  timestamp: bigint;
  text: string;
  transactionHash: string;
  blockNumber: bigint;
}

export default function Profile() {
  const { address, isConnected } = useAccount();

  // Query events for the connected wallet
  const { data: events, isLoading } = useQuery({
    queryKey: ["paymentEvents", address],
    queryFn: async (): Promise<PaymentEvent[]> => {
      if (!address) return [];

      const normalizedAddress = address.toLowerCase();

      // Get current block to use as toBlock
      const currentBlock = await publicClient.getBlockNumber();

      // Get ALL PaymentReceived events from the contract (last 10,000 blocks for performance)
      // If we need more, we can paginate
      const fromBlock = currentBlock > 10000n ? currentBlock - 10000n : 0n;

      console.log(`[Profile] Fetching events from block ${fromBlock} to ${currentBlock}`);

      // Get all events without filtering by payer (filter client-side)
      const logs = await publicClient.getLogs({
        address: PAY_CONTRACT_ADDRESS,
        event: paymentReceivedAbi,
        fromBlock,
        toBlock: currentBlock,
      });

      console.log(`[Profile] Found ${logs.length} total PaymentReceived events`);

      // Filter by payer address (case-insensitive)
      const userLogs = logs.filter((log) => {
        const payer = log.args.payer?.toLowerCase() || "";
        return payer === normalizedAddress;
      });

      console.log(`[Profile] Filtered to ${userLogs.length} events for wallet ${normalizedAddress}`);

      // Fetch transaction details to get block timestamp
      const eventsWithDetails = await Promise.all(
        userLogs.map(async (log) => {
          try {
            const block = await publicClient.getBlock({ blockNumber: log.blockNumber });

            return {
              payer: log.args.payer || "",
              amount: log.args.amount || 0n,
              timestamp: BigInt(block.timestamp),
              text: log.args.text || "",
              transactionHash: log.transactionHash,
              blockNumber: log.blockNumber,
            };
          } catch (error) {
            console.error(`[Profile] Error fetching block ${log.blockNumber}:`, error);
            // Return with 0 timestamp if block fetch fails
            return {
              payer: log.args.payer || "",
              amount: log.args.amount || 0n,
              timestamp: 0n,
              text: log.args.text || "",
              transactionHash: log.transactionHash,
              blockNumber: log.blockNumber,
            };
          }
        })
      );

      // Sort by block number (newest first)
      return eventsWithDetails.sort((a, b) => {
        if (b.blockNumber > a.blockNumber) return 1;
        if (b.blockNumber < a.blockNumber) return -1;
        return 0;
      });
    },
    enabled: isConnected && !!address,
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  if (!isConnected) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="card p-8 max-w-md text-center">
          <Wallet className="w-16 h-16 mx-auto mb-4 text-surface-500" />
          <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
          <p className="text-surface-400">
            Connect your wallet to view your payment history
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] py-8">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-display font-bold mb-2">
            <span className="gradient-text">Payment History</span>
          </h1>
          <p className="text-surface-400">
            View all payments you've made to analyze contracts
          </p>
        </div>

        {/* Wallet Info */}
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-900/50 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-primary-400" />
            </div>
            <div>
              <p className="text-xs text-surface-500 uppercase">Connected Wallet</p>
              <p className="text-sm font-mono text-surface-100">
                {shortenAddress(address || "", 10)}
              </p>
            </div>
          </div>
        </div>

        {/* Events List */}
        {isLoading ? (
          <div className="card p-8 text-center">
            <p className="text-surface-400">Loading payment history...</p>
          </div>
        ) : !events || events.length === 0 ? (
          <div className="card p-8 text-center">
            <Coins className="w-16 h-16 mx-auto mb-4 text-surface-500" />
            <h3 className="text-xl font-semibold mb-2">No Payments Yet</h3>
            <p className="text-surface-400">
              You haven't made any payments yet. Start analyzing contracts to see your payment history here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                {events.length} Payment{events.length !== 1 ? "s" : ""}
              </h2>
            </div>

            {events.map((event, index) => (
              <PaymentEventCard key={`${event.transactionHash}-${index}`} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentEventCard({ event }: { event: PaymentEvent }) {
  const date = new Date(Number(event.timestamp) * 1000);
  const amountInEth = Number(event.amount) / 1e18;

  return (
    <div className="card p-6 hover:border-primary-700/50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {/* Header */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-primary-900/50 flex items-center justify-center">
              <Coins className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <p className="font-semibold text-surface-100">Payment Received</p>
              <p className="text-xs text-surface-500">
                {date.toLocaleDateString()} {date.toLocaleTimeString()}
              </p>
            </div>
          </div>

          {/* Amount */}
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-primary-400">
                {amountInEth.toFixed(4)}
              </span>
              <span className="text-surface-400">ETH</span>
            </div>
          </div>

          {/* Text/Address */}
          {event.text && (
            <div className="mb-3">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4 text-surface-500" />
                <span className="text-surface-400">Contract:</span>
                <code className="text-surface-300 font-mono">
                  {event.text.length === 42 && event.text.startsWith("0x")
                    ? shortenAddress(event.text, 8)
                    : event.text}
                </code>
              </div>
            </div>
          )}

          {/* Transaction Info */}
          <div className="flex items-center gap-4 text-xs text-surface-500">
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>Block #{event.blockNumber.toString()}</span>
            </div>
            <a
              href={getBasescanTxUrl("base-sepolia", event.transactionHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary-400 hover:text-primary-300 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              View on Basescan
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
