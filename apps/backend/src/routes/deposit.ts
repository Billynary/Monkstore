// Deposit module — top up in-app tokens.
//
// Stripe runs in TEST MODE ONLY. When STRIPE_SECRET_KEY is unset, the module
// falls back to a "simulate" flow so the lab works without real keys.
//
// Intentional training vulnerability (see VULNERABILITIES.md):
//   [VULN C] POST /api/deposit/webhook does NOT verify the Stripe signature,
//            so anyone can forge a "payment completed" event and mint tokens.
// [VULN D] negative token amounts are not rejected (credits can be inverted).
import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, currentUser } from '../lib/auth.js';

// 1 token == 1 cent of fiat (so 1000 tokens == $10.00).
const CENTS_PER_TOKEN = 1;

// apiVersion omitted → uses the account default (avoids SDK version-literal churn).
const stripe = config.stripe.secretKey ? new Stripe(config.stripe.secretKey) : null;

async function creditWallet(userId: string, tokens: number, reference: string) {
  await prisma.transaction.create({
    data: { userId, type: 'DEPOSIT', amount: tokens, status: 'COMPLETED', reference },
  });
  await prisma.wallet.update({ where: { userId }, data: { balance: { increment: tokens } } });
}

export async function depositRoutes(app: FastifyInstance) {
  // Expose the publishable key + mode to the frontend.
  app.get('/api/deposit/config', async () => ({
    mode: stripe ? 'stripe' : 'simulate',
    publishableKey: config.stripe.publishableKey || null,
    centsPerToken: CENTS_PER_TOKEN,
  }));

  // Start a deposit. Creates a Deposit(PENDING) and either a Stripe Checkout
  // session (test mode) or a simulate handle.
  app.post('/api/deposit/create-session', { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = currentUser(req)!;
    const { tokens } = (req.body ?? {}) as { tokens?: number };
    if (typeof tokens !== 'number' || !Number.isFinite(tokens)) {
      return reply.code(400).send({ error: 'invalid_tokens' });
    }
    // [VULN D] no positivity check on tokens.
    const amountFiat = Math.trunc(tokens) * CENTS_PER_TOKEN;

    const deposit = await prisma.deposit.create({
      data: { userId, tokens: Math.trunc(tokens), amountFiat, currency: 'usd', status: 'PENDING' },
    });

    if (stripe) {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: `${tokens} Monk Tokens` },
              unit_amount: Math.max(0, amountFiat),
            },
            quantity: 1,
          },
        ],
        success_url: `${config.frontendOrigin}/profile.html?deposit=success`,
        cancel_url: `${config.frontendOrigin}/profile.html?deposit=cancel`,
        metadata: { userId, tokens: String(Math.trunc(tokens)), depositId: deposit.id },
      });
      await prisma.deposit.update({ where: { id: deposit.id }, data: { stripeSessionId: session.id } });
      return { mode: 'stripe', depositId: deposit.id, checkoutUrl: session.url, sessionId: session.id };
    }

    // Simulate mode: frontend "confirms" by posting a webhook event.
    return {
      mode: 'simulate',
      depositId: deposit.id,
      hint: 'POST /api/deposit/webhook with {type:"checkout.session.completed", data:{object:{metadata:{depositId}}}}',
    };
  });

  // [VULN C] Webhook without signature verification.
  app.post('/api/deposit/webhook', async (req, reply) => {
    const event = (req.body ?? {}) as {
      type?: string;
      data?: { object?: { metadata?: { userId?: string; tokens?: string; depositId?: string } } };
    };

    if (event.type !== 'checkout.session.completed') {
      return reply.send({ received: true, ignored: event.type ?? 'unknown' });
    }

    const meta = event.data?.object?.metadata ?? {};
    let userId = meta.userId;
    let tokens = meta.tokens ? parseInt(meta.tokens, 10) : NaN;

    // If a depositId is given, resolve the pending deposit for its authoritative values.
    if (meta.depositId) {
      const deposit = await prisma.deposit.findUnique({ where: { id: meta.depositId } });
      if (deposit) {
        userId = deposit.userId;
        tokens = deposit.tokens;
        await prisma.deposit.update({ where: { id: deposit.id }, data: { status: 'COMPLETED' } });
      }
    }

    if (!userId || Number.isNaN(tokens)) return reply.code(400).send({ error: 'missing_metadata' });

    // No signature was verified — this credit is fully attacker-controllable.
    await creditWallet(userId, tokens, `deposit:${meta.depositId ?? 'external'}`);
    return reply.send({ received: true, credited: tokens, userId });
  });
}
