# Smart Wallet Setup Guide

This guide will help you set up the complete smart wallet functionality end-to-end.

## ✅ What's Been Implemented

### Frontend
- ✅ SmartWalletProvider with ZeroDev SDK integration
- ✅ Profile page with Smart Wallet section
- ✅ AnalyzeForm with smart wallet payment support
- ✅ API client with user management endpoints

### Backend
- ✅ User model in Prisma schema
- ✅ User routes (`/api/users`, `/api/me`, `/api/me/smart-wallet/*`)
- ✅ Complete CRUD operations for user smart wallet management

### Database
- ✅ User table schema ready for migration

## 🚀 Setup Steps

### 1. Install Dependencies

**Frontend:**
```bash
cd apps/web
npm install
# or
pnpm install
```

**Backend:**
```bash
cd apps/server
npm install
# or
pnpm install
```

### 2. Database Migration

Run the Prisma migration to create the `users` table:

```bash
cd apps/server
npx prisma migrate dev --name add_user_smart_wallet
```

This will:
- Create a new migration file
- Apply it to your database
- Generate the updated Prisma Client

**Verify the migration:**
```bash
npx prisma studio
```

You should see a new `users` table with columns:
- `id` (UUID)
- `address` (String, unique)
- `smart_wallet_enabled` (Boolean)
- `smart_wallet_address` (String, nullable)
- `created_at` (DateTime)
- `updated_at` (DateTime)

### 3. Environment Variables

**Frontend (`apps/web/.env`):**
```bash
VITE_API_URL=http://localhost:3001
VITE_ZERODEV_PROJECT_ID=your-zerodev-project-id
```

**Backend (`apps/server/.env`):**
```bash
DATABASE_URL=postgresql://user:password@localhost:5432/baselens
# ... other existing vars
```

**Get ZeroDev Project ID:**
1. Go to [ZeroDev Dashboard](https://dashboard.zerodev.app)
2. Create a new project
3. Select "Base Sepolia" network
4. Copy the Project ID

### 4. Start the Services

**Terminal 1 - Backend:**
```bash
cd apps/server
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd apps/web
npm run dev
```

## 🧪 Testing the Complete Flow

### Test 1: User Creation on Wallet Connection

1. Open the app in browser
2. Connect your wallet (via OnchainKit)
3. **Check backend logs** - You should see:
   ```
   [Route] POST /api/users
   [Route] Creating or updating user: 0x...
   [Route] ✅ Created new user: <uuid>
   ```

4. **Check database:**
   ```sql
   SELECT * FROM users WHERE address = '0x...';
   ```
   Should show a new user with `smart_wallet_enabled = false`.

### Test 2: Smart Wallet Activation

1. Navigate to **Profile** page
2. Click **"Activate Smart Wallet"**
3. Approve the transaction in your wallet
4. **Check backend logs:**
   ```
   [Route] POST /api/me/smart-wallet/enable
   [Route] Enabling smart wallet for user: 0x...
   [Route] ✅ Smart wallet enabled for user: <uuid>
   ```

5. **Check database:**
   ```sql
   SELECT * FROM users WHERE address = '0x...';
   ```
   Should show:
   - `smart_wallet_enabled = true`
   - `smart_wallet_address = '0x...'` (the smart wallet contract address)

6. **Verify on Profile page:**
   - Status should show "Active" (green badge)
   - Smart wallet address should be displayed

### Test 3: Smart Wallet Payment

1. Ensure smart wallet is **Active**
2. Go to **Home** page (Analyze)
3. Enter a contract address
4. Click **"Start Analysis"**
5. You should see: **"Pay with Smart Wallet (gas sponsored)"**
6. Click the button
7. Approve in wallet
8. Payment should complete (gas sponsored by ZeroDev)
9. Analysis should start automatically

### Test 4: Smart Wallet Deactivation

1. Go to **Profile** page
2. Click **"Deactivate Smart Wallet"**
3. **Check backend logs:**
   ```
   [Route] POST /api/me/smart-wallet/disable
   [Route] ✅ Smart wallet disabled for user: <uuid>
   [Route] Smart wallet address kept: 0x...
   ```

4. **Check database:**
   ```sql
   SELECT * FROM users WHERE address = '0x...';
   ```
   Should show:
   - `smart_wallet_enabled = false`
   - `smart_wallet_address = '0x...'` (still saved!)

### Test 5: Smart Wallet Reactivation (Reuse)

1. On Profile page, click **"Activate Smart Wallet"** again
2. **Check backend logs:**
   ```
   [Route] POST /api/me/smart-wallet/enable
   [Route] Reusing existing smart wallet address: 0x...
   ```

3. **Verify:**
   - Same smart wallet address is reused (not a new one)
   - Status shows "Active" again

### Test 6: Verify Smart Wallet is a Contract

**Using Basescan:**
1. Copy smart wallet address from Profile page
2. Go to [Basescan Base Sepolia](https://sepolia.basescan.org)
3. Search for the address
4. Check the "Contract" tab - should show it's a contract

**Using Browser Console:**
```javascript
// After connecting wallet
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

const bytecode = await client.getBytecode({
  address: '0xYOUR_SMART_WALLET_ADDRESS'
});

console.log(bytecode !== "0x" ? "✅ Contract" : "❌ EOA");
```

## 📋 API Endpoints Reference

### POST `/api/users`
Create or update user when wallet connects.

**Request:**
```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

**Response:**
```json
{
  "id": "uuid",
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "smart_wallet_enabled": false,
  "smart_wallet_address": null,
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

### GET `/api/me?address=0x...`
Get current user profile.

**Response:**
```json
{
  "id": "uuid",
  "address": "0x...",
  "smart_wallet_enabled": true,
  "smart_wallet_address": "0x...",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

### POST `/api/me/smart-wallet/enable`
Enable smart wallet and save address.

**Request:**
```json
{
  "address": "0x...",
  "smartWalletAddress": "0x..."
}
```

### POST `/api/me/smart-wallet/disable`
Disable smart wallet (keeps address).

**Request:**
```json
{
  "address": "0x..."
}
```

## 🔍 Troubleshooting

### Migration Fails

**Error:** `relation "users" already exists`

**Solution:**
```bash
# Check if table exists
npx prisma studio

# If it exists but schema is different, reset (⚠️ deletes data)
npx prisma migrate reset

# Or manually drop and recreate
psql -d baselens -c "DROP TABLE IF EXISTS users CASCADE;"
npx prisma migrate dev
```

### Backend Can't Find User

**Check:**
1. User was created: `SELECT * FROM users;`
2. Address is normalized (lowercase)
3. Frontend is passing address correctly

**Debug:**
```bash
# Check backend logs
# Look for: [Route] Creating or updating user: 0x...
```

### Smart Wallet Activation Fails

**Check:**
1. ZeroDev Project ID is correct
2. Project is configured for Base Sepolia
3. Browser console for errors
4. ZeroDev dashboard for project status

### Payment Fails

**Check:**
1. Smart wallet is active (`smart_wallet_enabled = true`)
2. ZeroDev paymaster has funds
3. Contract address and amount are correct
4. Browser console for detailed errors

## 🎯 Key Features

✅ **User Persistence:** Users are saved when wallet connects  
✅ **Smart Wallet Reuse:** Same address reused on reactivation  
✅ **Address Persistence:** Address kept even when disabled  
✅ **Gas Sponsorship:** ZeroDev paymaster covers gas fees  
✅ **Backward Compatible:** EOA payments still work  
✅ **Full Integration:** Frontend ↔ Backend ↔ Database  

## 📝 Next Steps

1. **Run the migration:**
   ```bash
   cd apps/server
   npx prisma migrate dev --name add_user_smart_wallet
   ```

2. **Start both services:**
   - Backend: `cd apps/server && npm run dev`
   - Frontend: `cd apps/web && npm run dev`

3. **Test the flow:**
   - Connect wallet → User created
   - Activate smart wallet → Address saved
   - Make payment → Gas sponsored
   - Deactivate → Address kept
   - Reactivate → Same address reused

Everything is ready! 🚀
