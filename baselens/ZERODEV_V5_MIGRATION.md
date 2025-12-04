# ZeroDev SDK v5 Migration Notes

## Changes Made

### 1. Updated Package Versions
- `@zerodev/sdk`: `^3.0.0` → `^5.5.6`
- `@zerodev/ecdsa-validator`: `^3.0.0` → `^5.4.9`

### 2. API Changes

#### EntryPoint Version
- **v3:** Used `ENTRYPOINT_ADDRESS_V06` (EntryPoint v0.6)
- **v5:** Uses `getEntryPoint("0.7")` (EntryPoint v0.7)

#### Kernel Version
- **v3:** Used `KERNEL_V2_4`
- **v5:** Uses `KERNEL_V3_3`

### 3. Code Updates

**Before (v3):**
```typescript
import { ENTRYPOINT_ADDRESS_V06 } from "permissionless";
import { KERNEL_V2_4 } from "@zerodev/sdk/constants";

const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
  signer: walletClient,
  entryPoint: ENTRYPOINT_ADDRESS_V06,
  kernelVersion: KERNEL_V2_4,
});

const account = await createKernelAccount(publicClient, {
  plugins: { sudo: ecdsaValidator },
  entryPoint: ENTRYPOINT_ADDRESS_V06,
  kernelVersion: KERNEL_V2_4,
});
```

**After (v5):**
```typescript
import { getEntryPoint, KERNEL_V3_3 } from "@zerodev/sdk/constants";

const entryPoint = getEntryPoint("0.7");

const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
  signer: walletClient,
  entryPoint,
  kernelVersion: KERNEL_V3_3,
});

const account = await createKernelAccount(publicClient, {
  plugins: { sudo: ecdsaValidator },
  entryPoint,
  kernelVersion: KERNEL_V3_3,
});
```

### 4. Bundler Actions
- **v3:** `bundlerActions(ENTRYPOINT_ADDRESS_V06)`
- **v5:** `bundlerActions(getEntryPoint("0.7"))`

## Important Notes

1. **EntryPoint v0.7** is required for ZeroDev SDK v5
2. **Kernel v3.3** is the latest stable version
3. The API structure remains similar, just different constants
4. Paymaster configuration (`rpcUrl`) still works the same way

## Testing

After migration, test:
1. ✅ Smart wallet activation
2. ✅ Smart wallet payment
3. ✅ Gas sponsorship (if paymaster configured)
4. ✅ Address persistence and reuse
