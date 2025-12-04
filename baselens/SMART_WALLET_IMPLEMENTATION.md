# Smart Wallet Implementation Guide

This document describes the implementation of optional smart wallet support using ZeroDev SDK v3 for ERC-4337 account abstraction on BaseLens.

## Overview

The implementation adds **optional smart wallet support** to BaseLens while keeping OnchainKit for normal EOA wallets. Users can activate a smart wallet on the Profile page, and when active, all analysis payments use the smart wallet with gas sponsorship via ZeroDev's paymaster.

## Changes Made

### 1. Package Dependencies

**File:** `apps/web/package.json`

Added:
- `@zerodev/sdk`: ^3.0.0
- `@zerodev/ecdsa-validator`: ^3.0.0
- `permissionless`: ^0.1.0

### 2. Smart Wallet Provider

**File:** `apps/web/src/providers/SmartWalletProvider.tsx` (NEW)

A React context provider that:
- Initializes ZeroDev Kernel accounts using ECDSA validator
- Manages smart wallet state (address, active status)
- Provides `activateSmartWallet()` and `deactivateSmartWallet()` methods
- Provides `sendSmartWalletPayment()` for sending UserOperations
- Automatically checks backend for existing smart wallet on wallet connection

**Key Features:**
- Uses ZeroDev SDK v3 with Kernel v2.4
- Supports Base Sepolia testnet
- Integrates with ZeroDev paymaster for gas sponsorship
- Automatically constructs ZeroDev bundler/paymaster URLs from project ID

### 3. API Endpoints

**File:** `apps/web/src/api/endpoints.ts`

Added endpoints:
- `getUserProfile()`: GET `/api/me` - Returns user profile with smart wallet status
- `enableSmartWallet(smartWalletAddress)`: POST `/api/me/smart-wallet/enable` - Enables smart wallet
- `disableSmartWallet()`: POST `/api/me/smart-wallet/disable` - Disables smart wallet

### 4. Profile Page Updates

**File:** `apps/web/src/routes/Profile.tsx`

Added "Smart Wallet" section that displays:
- Status indicator: "Active" or "Inactive"
- EOA address (connected wallet)
- Smart wallet address (or "Not created yet")
- "Activate Smart Wallet" / "Deactivate Smart Wallet" button

**Requirements:**
- Only visible when user is connected with OnchainKit
- Shows real-time status from backend and SmartWalletProvider

### 5. Analyze Form Updates

**File:** `apps/web/src/components/AnalyzeForm.tsx`

Updated payment flow:
- If `isSmartWalletActive === false`: Uses existing OnchainKit `<Transaction />` component
- If `isSmartWalletActive === true`: Uses `sendSmartWalletPayment()` with smart wallet

**Behavior:**
- Smart wallet payments show "Pay with Smart Wallet (gas sponsored)" message
- OnchainKit payments show standard transaction confirmation UI
- Both paths call `onAnalyze()` callback on success

### 6. App Integration

**File:** `apps/web/src/main.tsx`

Wrapped app with `SmartWalletProvider`:
- Configured with ZeroDev project ID from environment variable
- Supports custom bundler/paymaster URLs (optional)
- Falls back to ZeroDev default URLs if not provided

## Environment Variables

Add to your `.env` file:

```bash
# ZeroDev Configuration
VITE_ZERODEV_PROJECT_ID=your-zerodev-project-id

# Optional: Custom URLs (if not using ZeroDev defaults)
# VITE_ZERODEV_BUNDLER_URL=https://custom-bundler-url
# VITE_ZERODEV_PAYMASTER_URL=https://custom-paymaster-url
```

**To get a ZeroDev Project ID:**
1. Sign up at [ZeroDev Dashboard](https://dashboard.zerodev.app)
2. Create a new project
3. Select "Base Sepolia" as the network
4. Copy the Project ID

## Backend Requirements

Your backend needs to support these endpoints:

### POST `/api/users` (User Creation/Update)

**Called automatically when a wallet connects.**

Request body:
```json
{
  "address": "0x..."
}
```

Response: User profile (created or updated):
```json
{
  "id": "user-id",
  "address": "0x...",
  "smart_wallet_enabled": false,
  "smart_wallet_address": null,
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

**Behavior:**
- If user with this address exists: Update `updatedAt` timestamp
- If user doesn't exist: Create new user with `address`, `smart_wallet_enabled: false`, `smart_wallet_address: null`
- Always return the user profile

### GET `/api/me`

Returns current user profile based on authentication/session:

```json
{
  "id": "user-id",
  "address": "0x...",
  "smart_wallet_enabled": false,
  "smart_wallet_address": null,
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

**Note:** Your backend should identify the user by wallet address (from session/auth headers or query params).

### POST `/api/me/smart-wallet/enable`

**Enables smart wallet and saves the address (or updates if already exists).**

Request body:
```json
{
  "smartWalletAddress": "0x..."
}
```

Response: Updated user profile:
```json
{
  "id": "user-id",
  "address": "0x...",
  "smart_wallet_enabled": true,
  "smart_wallet_address": "0x...",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

**Important:** 
- If `smart_wallet_address` already exists in database, **reuse it** (don't overwrite)
- Only set `smart_wallet_enabled: true`
- The address is deterministic, so the same EOA will always generate the same smart wallet address

### POST `/api/me/smart-wallet/disable`

**Disables smart wallet but keeps the address for future reactivation.**

Request body: `{}`

Response: Updated user profile:
```json
{
  "id": "user-id",
  "address": "0x...",
  "smart_wallet_enabled": false,
  "smart_wallet_address": "0x...",  // Still saved!
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

**Important:**
- Set `smart_wallet_enabled: false`
- **DO NOT** clear `smart_wallet_address` (keep it for reactivation)
- When user reactivates, reuse the same address

**Database Schema:**

Add to your `users` table/collection:
```sql
-- Example SQL schema
CREATE TABLE users (
  id VARCHAR(255) PRIMARY KEY,
  address VARCHAR(42) UNIQUE NOT NULL,  -- EOA address (0x...)
  smart_wallet_enabled BOOLEAN DEFAULT FALSE,
  smart_wallet_address VARCHAR(42) NULL,  -- Smart wallet address (persisted even when disabled)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_address ON users(address);
```

**Key Points:**
- `address`: User's EOA (Externally Owned Account) wallet address
- `smart_wallet_enabled`: Whether smart wallet is currently active
- `smart_wallet_address`: Smart wallet contract address (persisted even when disabled)
- When user reactivates, check if `smart_wallet_address` exists - if yes, reuse it

## Testing Guide

### 1. Setup

1. Install dependencies:
   ```bash
   cd apps/web
   npm install
   ```

2. Set environment variables in `.env`:
   ```bash
   VITE_ZERODEV_PROJECT_ID=your-project-id
   ```

3. Ensure backend endpoints are implemented (see above)

### 2. Test Smart Wallet Activation

1. Start the app: `npm run dev`
2. Connect your wallet using OnchainKit (via header)
3. Navigate to **Profile** page
4. You should see the "Smart Wallet" section
5. Click **"Activate Smart Wallet"**
6. Approve the transaction in your wallet (this signs the smart wallet creation)
7. Wait for activation to complete
8. Verify:
   - Status shows "Active" (green badge)
   - Smart wallet address is displayed
   - Address is different from your EOA address

### 3. Verify Smart Wallet is a Contract

To verify the smart wallet address is actually a contract on Base Sepolia:

**Option A: Using Basescan**
1. Copy the smart wallet address from Profile page
2. Go to [Basescan Base Sepolia](https://sepolia.basescan.org)
3. Search for the address
4. Check the "Contract" tab - it should show "Contract" if it's deployed

**Option B: Using viem (in browser console)**
```javascript
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

const bytecode = await client.getBytecode({
  address: '0xYOUR_SMART_WALLET_ADDRESS'
});

console.log('Bytecode:', bytecode);
// If bytecode !== "0x", it's a contract
```

**Option C: Using curl**
```bash
curl -X POST https://sepolia.base.org \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_getCode",
    "params": ["0xYOUR_SMART_WALLET_ADDRESS", "latest"],
    "id": 1
  }'
```

If the result is not `"0x"`, it's a contract.

### 4. Test Smart Wallet Payment

1. Ensure smart wallet is **Active** (from step 2)
2. Navigate to **Home** page (Analyze)
3. Enter a contract address
4. Click **"Start Analysis"**
5. You should see: **"Pay with Smart Wallet (gas sponsored)"** button
6. Click the button
7. Approve the transaction in your wallet
8. The payment should complete (gas sponsored by ZeroDev paymaster)
9. Analysis should start automatically

### 5. Test EOA Payment (Fallback)

1. Deactivate smart wallet on Profile page (or ensure it's inactive)
2. Navigate to **Home** page
3. Enter a contract address
4. Click **"Start Analysis"**
5. You should see the standard OnchainKit transaction UI
6. Complete the transaction normally (you pay gas)
7. Analysis should start

### 6. Test Deactivation

1. Go to Profile page
2. Click **"Deactivate Smart Wallet"**
3. Verify:
   - Status shows "Inactive"
   - Smart wallet address still shows (for reference)
   - Future payments will use EOA

## Architecture Notes

### Smart Wallet Flow

1. **Wallet Connection:**
   - User connects wallet via OnchainKit
   - `SmartWalletProvider` automatically calls `POST /api/users` with wallet address
   - Backend creates/updates user record
   - Frontend fetches user profile via `GET /api/me`
   - If `smart_wallet_enabled: true` and `smart_wallet_address` exists, initialize smart wallet

2. **Activation:**
   - User clicks "Activate Smart Wallet"
   - `SmartWalletProvider` checks backend for existing `smart_wallet_address`
   - If address exists: Reuse it (don't create new one)
   - If address doesn't exist: Create Kernel account (deterministic address)
   - Save to backend via `POST /api/me/smart-wallet/enable`
   - Backend sets `smart_wallet_enabled: true` and saves address

3. **Deactivation:**
   - User clicks "Deactivate Smart Wallet"
   - Frontend calls `POST /api/me/smart-wallet/disable`
   - Backend sets `smart_wallet_enabled: false`
   - **Backend keeps `smart_wallet_address`** (for future reactivation)

4. **Reactivation:**
   - User clicks "Activate Smart Wallet" again
   - Frontend checks backend for existing `smart_wallet_address`
   - If exists: Reuse the same address (no new smart wallet created)
   - Backend sets `smart_wallet_enabled: true` again

5. **Payment:**
   - When `isSmartWalletActive === true`, `AnalyzeForm` uses `sendSmartWalletPayment()`
   - Creates UserOperation with encoded call data
   - Sends via ZeroDev bundler
   - Paymaster sponsors gas fees
   - On success, triggers `onAnalyze()` callback

6. **State Management:**
   - Smart wallet state is stored in React context (`SmartWalletProvider`)
   - Backend is source of truth for `smart_wallet_enabled` flag and `smart_wallet_address`
   - Frontend syncs on wallet connection and after activation/deactivation
   - Smart wallet address is **persisted** even when disabled (for reuse)

### ZeroDev Integration

- **SDK Version:** v3.0.0
- **Kernel Version:** v2.4
- **Entry Point:** ERC-4337 EntryPoint v0.6
- **Validator:** ECDSA (via `@zerodev/ecdsa-validator`)
- **Network:** Base Sepolia (chain ID: 84532)

### Compatibility

- ✅ Works alongside OnchainKit (no conflicts)
- ✅ Supports both EOA and smart wallet payments
- ✅ Backward compatible (existing EOA payments still work)
- ✅ Optional feature (users can choose to activate or not)

## Troubleshooting

### Smart wallet activation fails

- Check ZeroDev project ID is correct in `.env`
- Verify project is configured for Base Sepolia in ZeroDev dashboard
- Check browser console for errors
- Ensure wallet is connected via OnchainKit

### Payment fails with smart wallet

- Verify smart wallet is active (check Profile page)
- Check ZeroDev paymaster has sufficient funds
- Verify contract address and amount are correct
- Check browser console for detailed error messages

### Backend errors

- Ensure `/api/me` endpoint returns correct format
- Verify database has `smart_wallet_enabled` and `smart_wallet_address` fields
- Check CORS settings if calling from frontend
- Verify authentication is working (if required)

## Files Modified/Created

### Created:
- `apps/web/src/providers/SmartWalletProvider.tsx`

### Modified:
- `apps/web/package.json`
- `apps/web/src/main.tsx`
- `apps/web/src/api/endpoints.ts`
- `apps/web/src/routes/Profile.tsx`
- `apps/web/src/components/AnalyzeForm.tsx`

## Next Steps

1. Implement backend endpoints (if not done)
2. Test on Base Sepolia testnet
3. Monitor ZeroDev dashboard for usage and paymaster balance
4. Consider adding smart wallet balance display
5. Add transaction history for smart wallet payments
6. Consider migrating to Base Mainnet when ready
