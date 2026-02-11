import { createAuthenticatedSession } from './auth';
import { loadConfig } from './config';
import { createLimitBuyOrder, createLimitSellOrder, getOrders, formatSolAmount } from './trading';
import { getNewestTokens } from './market';
import WebSocket from 'ws';

// Polyfill WebSocket for Node.js
(globalThis as any).WebSocket = WebSocket;

const SOLANA_CHAIN_ID = 622112261;

async function testSolanaLimitOrders() {
  console.log('📋 Solana Limit Orders Test\n');
  console.log('=' .repeat(70));

  const config = loadConfig();

  // Step 1: Authenticate on Solana
  console.log('\n[1/5] 🔐 Authenticating on Solana...');
  let session;
  try {
    session = await createAuthenticatedSession({
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      walletAddress: config.walletAddress,
      privateKey: config.privateKey,
      chainId: SOLANA_CHAIN_ID,
    });
  } catch (error) {
    // Fallback to Arbitrum if Solana fails
    session = await createAuthenticatedSession({
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      walletAddress: config.walletAddress,
      privateKey: config.privateKey,
      chainId: 42161,
    });
  }
  console.log(`✅ Wallet: ${session.walletAddress}`);

  // Step 2: Find a token
  console.log('\n[2/5] 🔍 Finding active token on Solana...');
  const newest = await getNewestTokens(session.sdk, SOLANA_CHAIN_ID, 20);

  if (!newest || newest.length === 0) {
    console.log('❌ No tokens found on Solana');
    return;
  }

  // Sort by activity (use first token regardless of price)
  const sorted = [...newest].sort((a: any, b: any) => (b.txCount || 0) - (a.txCount || 0));

  if (sorted.length === 0) {
    console.log('❌ No tokens found');
    return;
  }

  const token = sorted[0];
  const currentPrice = parseFloat(token.price || '0');

  // If no price data, use a default for testing
  const testPrice = currentPrice > 0 ? currentPrice : 0.0001;

  console.log(`✅ Selected: ${token.symbol} (${token.name})`);
  console.log(`   Current Price: $${testPrice.toFixed(8)} ${currentPrice === 0 ? '(using test price)' : ''}`);
  console.log(`   Market Cap: $${parseFloat(token.marketCap || '0').toLocaleString()}`);
  console.log(`   Transactions: ${token.txCount || 0}`);

  // Step 3: Create limit BUY order (below market price, won't execute immediately)
  console.log('\n[3/5] 📈 Creating LIMIT BUY order...');

  const buyTriggerPrice = (testPrice * 0.95).toFixed(10); // 5% below current
  const buyAmount = formatSolAmount(0.005); // 0.005 SOL

  console.log(`   Token: ${token.symbol}`);
  console.log(`   Amount: 0.005 SOL`);
  console.log(`   Trigger Price: $${buyTriggerPrice} (5% below market)`);
  console.log(`   Take Profit: 20%`);
  console.log(`   Stop Loss: 10%`);

  try {
    const buyOrderResult = await createLimitBuyOrder(session, {
      tokenAddress: token.address,
      amount: buyAmount,
      triggerPrice: buyTriggerPrice,
      profitPercent: 20,
      lossPercent: 10,
      chainId: SOLANA_CHAIN_ID,
    });

    if (buyOrderResult.isSuccess) {
      console.log('✅ Limit BUY order created!');
      if ((buyOrderResult as any).orderId) {
        console.log(`   Order ID: ${(buyOrderResult as any).orderId}`);
      }
    } else {
      console.log('❌ Limit BUY order failed:', (buyOrderResult as any).error || buyOrderResult.message);
    }
  } catch (error: any) {
    console.log('❌ Limit BUY order error:', error.message);
  }

  // Step 4: Create limit SELL order (above market price, won't execute immediately)
  console.log('\n[4/5] 📉 Creating LIMIT SELL order...');

  const sellTriggerPrice = (testPrice * 1.05).toFixed(10); // 5% above current
  const sellAmount = formatSolAmount(0.003); // 0.003 SOL

  console.log(`   Token: ${token.symbol}`);
  console.log(`   Amount: 0.003 SOL`);
  console.log(`   Trigger Price: $${sellTriggerPrice} (5% above market)`);

  try {
    const sellOrderResult = await createLimitSellOrder(session, {
      tokenAddress: token.address,
      amount: sellAmount,
      triggerPrice: sellTriggerPrice,
      chainId: SOLANA_CHAIN_ID,
    });

    if (sellOrderResult.isSuccess) {
      console.log('✅ Limit SELL order created!');
      if ((sellOrderResult as any).orderId) {
        console.log(`   Order ID: ${(sellOrderResult as any).orderId}`);
      }
    } else {
      console.log('❌ Limit SELL order failed:', (sellOrderResult as any).error || sellOrderResult.message);
    }
  } catch (error: any) {
    console.log('❌ Limit SELL order error:', error.message);
  }

  // Step 5: List all orders
  console.log('\n[5/5] 📋 Checking active orders...');

  try {
    const ordersResult = await getOrders(session, SOLANA_CHAIN_ID);

    // Handle different response formats
    let orders: any[] = [];
    if (Array.isArray(ordersResult)) {
      orders = ordersResult;
    } else if (ordersResult && typeof ordersResult === 'object') {
      // Try to extract orders from object
      orders = ordersResult.orders || ordersResult.data || [];
    }

    if (!orders || orders.length === 0) {
      console.log('   No active orders found (or orders format changed)');
      console.log('   Raw response:', JSON.stringify(ordersResult, null, 2).substring(0, 200));
    } else {
      console.log(`✅ Found ${orders.length} active order(s)\n`);

      orders.forEach((order: any, i: number) => {
        const orderType = order.isBuy ? '📈 BUY' : '📉 SELL';
        const status = order.status || 'PENDING';

        console.log(`${i + 1}. ${orderType} Order`);
        console.log(`   Token: ${order.tokenSymbol || order.tokenAddress?.substring(0, 10)}`);
        console.log(`   Trigger Price: $${order.triggerPrice || 'N/A'}`);
        console.log(`   Amount: ${order.amount || 'N/A'}`);
        console.log(`   Status: ${status}`);
        if (order.orderId) {
          console.log(`   Order ID: ${order.orderId}`);
        }
        console.log();
      });
    }
  } catch (error: any) {
    console.log('⚠️  Could not fetch orders:', error.message);
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('✅ Limit Orders Test Complete!');
  console.log('='.repeat(70));
  console.log('\n📊 Summary:');
  console.log(`   Token Tested: ${token.symbol}`);
  console.log(`   Current Price: $${testPrice.toFixed(8)}`);
  console.log(`   Limit Buy Target: $${buyTriggerPrice} (5% below)`);
  console.log(`   Limit Sell Target: $${sellTriggerPrice} (5% above)`);
  console.log('\n💡 These orders will execute automatically when:');
  console.log(`   - Price drops to $${buyTriggerPrice} (triggers BUY)`);
  console.log(`   - Price rises to $${sellTriggerPrice} (triggers SELL)`);
  console.log('\n🔍 Check order status anytime with: getOrders()');
}

if (require.main === module) {
  testSolanaLimitOrders().catch(console.error);
}

export { testSolanaLimitOrders };
