# OnchainKit & Wagmi Integration

This document contains all the code related to OnchainKit and Wagmi integration in BaseLens.

## Dependencies

```json
// apps/web/package.json
{
  "dependencies": {
    "@coinbase/onchainkit": "^0.36.6",
    "viem": "^2.21.0",
    "wagmi": "^2.14.0"
  }
}
```

## Environment Variables

```bash
# .env
VITE_PUBLIC_ONCHAINKIT_API_KEY=your-onchainkit-api-key-here
```

Get your API key from [Coinbase Developer Portal](https://portal.cdp.coinbase.com).

---

## 1. Provider Setup

### `src/providers/OnchainKitProvider.tsx`

Configures Wagmi and OnchainKit for Base Sepolia testnet.

```tsx
import { ReactNode } from "react";
import { baseSepolia } from "viem/chains";
import { http, createConfig } from "wagmi";
import { WagmiProvider } from "wagmi";
import { coinbaseWallet } from "wagmi/connectors";
import { OnchainKitProvider as OCKProvider } from "@coinbase/onchainkit";

// Wagmi configuration for Base Sepolia
const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [
    coinbaseWallet({
      appName: "BaseLens",
      preference: "smartWalletOnly",
    }),
  ],
  transports: {
    [baseSepolia.id]: http(),
  },
});

interface OnchainKitProviderProps {
  children: ReactNode;
}

export function OnchainKitProvider({ children }: OnchainKitProviderProps) {
  const apiKey = import.meta.env.VITE_PUBLIC_ONCHAINKIT_API_KEY || "";

  return (
    <WagmiProvider config={wagmiConfig}>
      <OCKProvider
        apiKey={apiKey}
        chain={baseSepolia}
        config={{
          appearance: {
            mode: "auto",
            theme: "cyberpunk",
          },
          wallet: {
            display: "modal",
          },
        }}
      >
        {children}
      </OCKProvider>
    </WagmiProvider>
  );
}
```

---

## 2. App Entry Point

### `src/main.tsx`

Wraps the app with OnchainKit provider and imports styles.

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./hooks/useTheme";
import { ToastProvider } from "./components/ui/Toast";
import { OnchainKitProvider } from "./providers/OnchainKitProvider";
import "@coinbase/onchainkit/styles.css"; // OnchainKit styles
import "./styles/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 2,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <OnchainKitProvider>
        <BrowserRouter>
          <ThemeProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </ThemeProvider>
        </BrowserRouter>
      </OnchainKitProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
```

---

## 3. Wallet Connection (Header)

### `src/components/Layout.tsx`

Wallet connect button in the header with identity display.

```tsx
import { ConnectWallet, Wallet, WalletDropdown, WalletDropdownDisconnect } from "@coinbase/onchainkit/wallet";
import { Address, Avatar, Name, Identity } from "@coinbase/onchainkit/identity";

// Inside the header navigation:
<Wallet>
  <ConnectWallet>
    <Avatar className="h-6 w-6" />
    <Name />
    <Address />
  </ConnectWallet>
  <WalletDropdown>
    <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
      <Avatar />
      <Name />
      <Address />
    </Identity>
    <WalletDropdownDisconnect />
  </WalletDropdown>
</Wallet>
```

### Components Used:
- `Wallet` - Container for wallet components
- `ConnectWallet` - Button that shows connect modal when disconnected
- `Avatar` - User's profile picture/identicon
- `Name` - ENS name or Basename (if available)
- `Address` - Truncated wallet address (e.g., `0x1234...5678`)
- `Identity` - Container for identity components with copy functionality
- `WalletDropdown` - Dropdown menu when connected
- `WalletDropdownDisconnect` - Disconnect button

---

## 4. Payment Transaction

### `src/components/AnalyzeForm.tsx`

Handles payment transaction before starting analysis.

```tsx
import {
  Transaction,
  TransactionButton,
  TransactionStatus,
  TransactionStatusAction,
  TransactionStatusLabel,
} from "@coinbase/onchainkit/transaction";
import type { LifecycleStatus } from "@coinbase/onchainkit/transaction";
import { parseEther, encodeFunctionData } from "viem";

const PAY_CONTRACT_ADDRESS = "0x4ab920a4b2Ff9CB1206225c774DD14d78036c398" as const;
const PAY_AMOUNT = parseEther("0.01"); // 0.01 ETH

// ABI for the pay function
const payAbi = [
  {
    type: "function",
    name: "pay",
    inputs: [
      {
        name: "text",
        type: "string",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

// Inside the component:
export default function AnalyzeForm({ onAnalyze }: AnalyzeFormProps) {
  const [address, setAddress] = useState("");
  const [isValidated, setIsValidated] = useState(false);

  // Encode the pay(text) function call
  const payData = encodeFunctionData({
    abi: payAbi,
    functionName: "pay",
    args: [address.trim() || "BaseLens Analysis"],
  });

  const calls = [
    {
      to: PAY_CONTRACT_ADDRESS,
      data: payData,
      value: PAY_AMOUNT, // 0.01 ETH
    },
  ];

  const handleOnStatus = useCallback(
    (status: LifecycleStatus) => {
      console.log("Transaction status:", status);
      if (status.statusName === "success") {
        // Transaction confirmed, now call the backend
        onAnalyze(address.trim(), network);
        setIsValidated(false);
      }
    },
    [address, network, onAnalyze]
  );

  return (
    // ... form fields ...
    
    {isValidated && (
      <Transaction
        chainId={84532} // Base Sepolia chain ID
        calls={calls}
        onStatus={handleOnStatus}
      >
        <TransactionButton className="btn btn-primary w-full btn-lg" />
        <TransactionStatus>
          <TransactionStatusLabel />
          <TransactionStatusAction />
        </TransactionStatus>
      </Transaction>
    )}
  );
}
```

### Transaction Flow:
1. User fills form and clicks "Start Analysis"
2. Form validates the address
3. Transaction UI appears with `pay(address)` call
4. User confirms transaction (0.01 ETH)
5. On success (`statusName === 'success'`), backend analysis starts

### Components Used:
- `Transaction` - Container that manages transaction lifecycle
- `TransactionButton` - Button to initiate transaction
- `TransactionStatus` - Shows transaction status
- `TransactionStatusLabel` - Status text (pending, confirmed, etc.)
- `TransactionStatusAction` - Action button (view on explorer, etc.)

### Lifecycle Status Values:
- `init` - Initial state
- `pendingWalletAction` - Waiting for wallet approval
- `transactionPending` - Transaction submitted, waiting for confirmation
- `transactionApproved` - Transaction approved by wallet
- `success` - Transaction confirmed on blockchain
- `error` - Transaction failed

---

## 5. Smart Contract (TreasuryPayment)

The payment contract on Base Sepolia:

**Address:** `0x4ab920a4b2Ff9CB1206225c774DD14d78036c398`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract TreasuryPayment is Ownable, ReentrancyGuard {
    uint256 public constant PAYMENT_AMOUNT = 0.01 ether;
    
    event PaymentReceived(
        address indexed payer, 
        uint256 amount, 
        uint256 timestamp,
        string text
    );
    
    function pay(string memory text) external payable nonReentrant {
        require(msg.value >= PAYMENT_AMOUNT, "Insufficient payment");
        emit PaymentReceived(msg.sender, msg.value, block.timestamp, text);
    }
}
```

---

## Summary

| Feature | OnchainKit Component | Location |
|---------|---------------------|----------|
| Provider | `OnchainKitProvider` | `providers/OnchainKitProvider.tsx` |
| Wallet Connect | `Wallet`, `ConnectWallet` | `components/Layout.tsx` |
| Identity Display | `Avatar`, `Name`, `Address`, `Identity` | `components/Layout.tsx` |
| Transaction | `Transaction`, `TransactionButton` | `components/AnalyzeForm.tsx` |
| Styles | `@coinbase/onchainkit/styles.css` | `main.tsx` |

## Network Configuration

- **Chain:** Base Sepolia Testnet
- **Chain ID:** 84532
- **Connector:** Coinbase Wallet (Smart Wallet Only)
- **Theme:** Cyberpunk
