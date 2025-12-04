# Backend Route Fix Guide

## Issue
The backend is returning 404 for `/api/users` and `/api/me` endpoints.

## Root Cause
After resetting the database volume, the backend routes file exists but the server may need to be restarted, or the database migration hasn't been run.

## Solution

### 1. Run Database Migration

The `User` table needs to be created in the database:

```bash
cd apps/server
npx prisma migrate dev --name add_user_smart_wallet
```

This will:
- Create a migration file
- Apply it to your database
- Generate the updated Prisma Client

### 2. Restart Backend Server

After running the migration, restart your backend server:

```bash
cd apps/server
npm run dev
# or
pnpm dev
```

### 3. Verify Routes Are Registered

Check the backend logs when starting. You should see routes being registered. The routes should be:

- `POST /api/users` - Create/update user
- `GET /api/me?address=0x...` - Get user profile
- `POST /api/me/smart-wallet/enable` - Enable smart wallet
- `POST /api/me/smart-wallet/disable` - Disable smart wallet

### 4. Test the Endpoints

**Test user creation:**
```bash
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -d '{"address": "0x7d85bF7a82470837A1d832e4fa503a7ebF20ca97"}'
```

**Test get user:**
```bash
curl "http://localhost:3001/api/me?address=0x7d85bF7a82470837A1d832e4fa503a7ebF20ca97"
```

### 5. Check Backend Logs

When you make a request, you should see in the backend logs:
```
[Route] POST /api/users
[Route] Creating or updating user: 0x...
[Route] ✅ Created new user: <uuid>
```

If you don't see these logs, the routes aren't being hit, which means:
- The server isn't running
- The routes file isn't being loaded
- There's a compilation error

## Route Structure

The routes are registered as:
- `app.use("/api", userRoutes)` in `index.ts`
- `router.post("/users", ...)` in `users.ts` → Creates `/api/users`
- `router.get("/me", ...)` in `users.ts` → Creates `/api/me`
- `router.post("/me/smart-wallet/enable", ...)` → Creates `/api/me/smart-wallet/enable`
- `router.post("/me/smart-wallet/disable", ...)` → Creates `/api/me/smart-wallet/disable`

## Common Issues

### Issue: "Cannot POST /api/users"
**Solution:** 
1. Check if server is running
2. Check if routes file is imported in `index.ts`
3. Restart the server after adding routes

### Issue: "User not found" (404 on /api/me)
**Solution:**
1. Create user first via `POST /api/users`
2. Or the user will be auto-created when activating smart wallet

### Issue: Database errors
**Solution:**
1. Run migration: `npx prisma migrate dev`
2. Check database connection in `.env`
3. Verify Prisma schema is correct
