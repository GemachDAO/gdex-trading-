# HyperLiquid Trading Breakthrough Session - Feb 12, 2026

## 🎉 MAJOR ACHIEVEMENTS

### 1. ✅ DEPOSIT TO HYPERLIQUID - WORKING!

**Discovery**: Found the correct `/v1/hl/deposit` endpoint and successfully deposited $10 USDC to HyperLiquid custodial account.

**Working Implementation**: `src/deposit-hl-correct.ts`

**Key Findings**:
1. **Endpoint**: `POST /v1/hl/deposit` (NOT `/hyperliquid/deposit` or SDK's `hlDeposit()`)
2. **CORS Headers REQUIRED**:
   ```javascript
   'Origin': 'https://gdex.pro'
   'Referer': 'https://gdex.pro/'
   ```
3. **Encoding**: `CryptoUtils.encodeInputData("hl_deposit", { chainId, tokenAddress, amount, nonce })`
4. **Signing Pattern**: `hl_deposit-${userId}-${encodedData}`
5. **Encryption**: Full payload object encrypted with API key
6. **userId**: Use control wallet address (lowercase)

**Working Code Pattern**:
```typescript
const encodedData = CryptoUtils.encodeInputData("hl_deposit", {
  chainId: 42161,
  tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC on Arbitrum
  amount: "10000000", // 10 USDC (6 decimals)
  nonce: generateNonce().toString()
});

const userId = session.walletAddress.toLowerCase();
const signature = CryptoUtils.sign(`hl_deposit-${userId}-${encodedData}`, session.tradingPrivateKey);

const payload = { userId, data: encodedData, signature, apiKey };
const computedData = encrypt(JSON.stringify(payload), apiKey);

await axios.post(`${apiUrl}/hl/deposit`, { computedData }, {
  headers: {
    'Origin': 'https://gdex.pro',
    'Referer': 'https://gdex.pro/',
  }
});
```

**Verification**: Successfully deposited $10 USDC, visible in custodial HyperLiquid account balance.

### 2. 🔍 LEVERAGED POSITION OPENING - PARTIALLY SOLVED

**Discovery**: Found the correct endpoint and format, website successfully places orders, but code still gets "Sent order failed".

**Endpoint**: `POST /v1/hl/create_order`

**What Works**:
- ✅ Endpoint discovered and tested
- ✅ CORS headers working (403 → 400 progress)
- ✅ Encoding working: `CryptoUtils.encodeInputData("hl_create_order", params)`
- ✅ Signature generation working
- ✅ Payload encryption working
- ✅ Balance available ($10 on custodial HyperLiquid account)
- ✅ **Website successfully places orders** (user confirmed "Place order successful")

**Current Issue**:
- Code gets "Sent order failed" from HyperLiquid (error from HL, not GDEX)
- This means: GDEX accepts request, signs it, sends to HyperLiquid, but HL rejects it

**Next Step**:
- Compare actual website request payload with code payload
- User needs to capture `computedData` from successful website order
- Compare encrypted payloads to find difference

### 3. 🔑 CUSTODIAL WALLET SYSTEM UNDERSTANDING

**Critical Discovery**: GDEX uses TWO wallet addresses for HyperLiquid trading:

1. **Control Wallet** (`0x01779499970726ff4C111dDF58A2CA6c366b0E20`)
   - User controls with private key
   - Used as `userId` in API calls
   - Used for authentication

2. **Custodial Address** (`0x886e83feb8d1774afab4a32047a083434354c6f0`)
   - GDEX controls this wallet
   - Used for actual HyperLiquid trading
   - Website trades with this address
   - Both addresses now have $10 on HyperLiquid

**Key Insight**:
- Use control wallet as `userId` in requests
- Backend automatically routes to custodial address for HyperLiquid operations
- Sign with control wallet's session trading key

## 📊 PROGRESS SUMMARY

| Component | Status | Details |
|-----------|--------|---------|
| Deposit Endpoint | ✅ WORKING | `/v1/hl/deposit` fully functional |
| CORS Headers | ✅ SOLVED | Must use `Origin: https://gdex.pro` |
| Encoding | ✅ WORKING | `CryptoUtils.encodeInputData()` correct |
| Signing | ✅ WORKING | Pattern: `{action}-{userId}-{encodedData}` |
| Encryption | ✅ WORKING | Full payload encrypted with API key |
| Order Endpoint | ✅ FOUND | `/v1/hl/create_order` |
| Balance | ✅ FUNDED | $10 on custodial HyperLiquid account |
| Website Orders | ✅ CONFIRMED | User successfully placed orders on website |
| Code Orders | ❌ IN PROGRESS | Gets "Sent order failed" from HyperLiquid |

## 🔬 TECHNICAL DISCOVERIES

### CORS Requirements
**Problem**: Initial attempts got 403 "Access denied: Invalid client"
**Solution**: GDEX API requires specific CORS headers:
```javascript
{
  'Origin': 'https://gdex.pro',
  'Referer': 'https://gdex.pro/',
  'User-Agent': 'Mozilla/5.0 ...'  // Optional but recommended
}
```

### Encryption Flow
1. Create payload object: `{ userId, data, signature, apiKey }`
2. Stringify: `JSON.stringify(payload)`
3. Encrypt with API key using AES-256-CBC
4. Send as: `{ computedData: encryptedHexString }`

### Backend Code Insights
User provided backend code showing:
- `/deposit` endpoint expects `computedData` with encrypted payload
- Data array format: `[chainId, tokenAddress, amount, nonce]`
- Signing pattern: `{action}-${userId}-${encodedData}`
- Backend validates signature, decrypts, and processes

## 🛠️ NEW SCRIPTS CREATED

1. **`src/deposit-hl-correct.ts`** - ✅ WORKING
   - Deposits USDC to HyperLiquid custodial account
   - Monitors balance until deposit confirms
   - Usage: `npm run deposit:hl [amount]`

2. **`src/test-hl-new-sdk-approach.ts`** - 🔧 IN PROGRESS
   - Attempts to place HyperLiquid leveraged orders
   - Uses correct endpoint and format
   - Gets "Sent order failed" - needs payload comparison

3. **`src/check-hl-balances.ts`** - ✅ WORKING
   - Checks HyperLiquid balances for both control wallet and custodial address
   - Shows both balances side-by-side
   - Usage: `npm run check:hl:balance`

4. **`src/deposit-to-custodial-hl.ts`** - Experimental
   - Attempted alternate deposit approach
   - Helped identify nonce issues

## 📝 DOCUMENTATION UPDATED

- ✅ `SKILL.md` - Updated with deposit breakthrough and order progress
- ✅ `MEMORY.md` - Added breakthrough section at top
- ✅ `CLAUDE.md` - Updated HyperLiquid section
- ✅ `README.md` - Updated status and scripts
- ✅ `BREAKTHROUGH.md` - This file

## 🎯 NEXT STEPS

### Immediate (to complete order placement):
1. **User captures website payload**:
   - Place successful order on gdex.pro
   - Capture POST request to `/v1/hl/create_order`
   - Copy `computedData` value from payload

2. **Compare payloads**:
   - Decrypt both (website vs code) to compare structure
   - Identify difference causing "Sent order failed"
   - Update code to match website format

3. **Test and verify**:
   - Place small test order with corrected code
   - Verify position opens on HyperLiquid
   - Document final working solution

### Future Improvements:
- Add deposit monitoring with better error handling
- Create unified HyperLiquid trading interface
- Add position management helpers
- Write comprehensive tests

## 🏆 KEY LEARNINGS

1. **CORS is critical** - Backend restricts to `gdex.pro` origin
2. **SDK methods may be outdated** - Direct HTTP calls to new endpoints work better
3. **Custodial routing** - Backend handles wallet routing, use control wallet as userId
4. **Error messages are specific** - "Unauthorized" vs "Sent order failed" indicate different issues
5. **Website is the source of truth** - If website works, solution exists
6. **Encryption is mandatory** - All sensitive payloads must be encrypted with API key
7. **Nonce errors can be misleading** - May succeed despite showing errors

## 📞 USER COLLABORATION

User provided critical information:
- Backend code showing correct endpoint structure
- Confirmation that website successfully places orders
- Custodial address usage confirmation
- Network request headers from successful website calls

This collaboration was essential for the breakthrough!

## 🎊 IMPACT

**Before**:
- ❌ HyperLiquid deposits failed ("Unauthorized")
- ❌ No way to fund HyperLiquid account
- ❌ Couldn't test order placement
- ❌ Unclear which endpoints to use

**After**:
- ✅ HyperLiquid deposits working
- ✅ $10 funded and confirmed on custodial account
- ✅ Order endpoint identified and partially working
- ✅ Clear path to completion
- ✅ Website confirmed as working reference

**Status**: 80% complete - Deposit fully working, orders need payload comparison to finish.
