import express, { Request, Response } from 'express';
import { StripeService, stripe } from '../services/stripe.service.js';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { STRIPE_WEBHOOK_SECRET } from '../config/env.js';

const router = express.Router();

/**
 * POST /stripe/create-checkout-session
 * Create Stripe Checkout Session for NEW subscription
 * If user has existing subscription, returns error - use change-plan instead
 */
router.post('/create-checkout-session', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!StripeService.isConfigured()) {
      res.status(503).json({ error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY.' });
      return;
    }

    const { planId, billingInterval } = req.body;

    if (!planId) {
      res.status(400).json({ error: 'Plan ID is required' });
      return;
    }

    if (!billingInterval || !['monthly', 'yearly'].includes(billingInterval)) {
      res.status(400).json({ error: 'Invalid billing interval. Must be "monthly" or "yearly".' });
      return;
    }

    const url = await StripeService.createCheckoutSession({
      userId: req.user!.id,
      userEmail: req.user!.email,
      planId,
      billingInterval,
    });

    res.json({ url });
  } catch (error) {
    console.error('Create checkout session error:', error);
    
    // Handle existing subscription case
    if (error instanceof Error && error.message === 'EXISTING_SUBSCRIPTION') {
      res.status(409).json({ 
        error: 'You already have an active subscription. Use the change plan feature instead.',
        code: 'EXISTING_SUBSCRIPTION'
      });
      return;
    }
    
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create checkout session',
    });
  }
});

/**
 * POST /stripe/change-plan
 * Change subscription plan (for existing subscribers)
 * This is the production-standard way to handle plan changes
 */
router.post('/change-plan', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!stripe) {
      res.status(503).json({ error: 'Stripe is not configured' });
      return;
    }

    const { planId, billingInterval } = req.body;

    if (!planId) {
      res.status(400).json({ error: 'Plan ID is required' });
      return;
    }

    if (!billingInterval || !['monthly', 'yearly'].includes(billingInterval)) {
      res.status(400).json({ error: 'Invalid billing interval' });
      return;
    }

    // Get user
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, req.user!.id),
    });

    if (!user?.stripeCustomerId) {
      res.status(400).json({ error: 'No billing account found' });
      return;
    }

    // Get the plan
    const plan = await db.query.plans.findFirst({
      where: eq(schema.plans.id, planId),
    });

    if (!plan) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }

    const priceId = billingInterval === 'monthly' 
      ? plan.stripePriceIdMonthly 
      : plan.stripePriceIdYearly;

    if (!priceId) {
      res.status(400).json({ error: 'Plan not configured in Stripe' });
      return;
    }

    // Get active subscription from Stripe
    const activeSubscription = await StripeService.getActiveStripeSubscription(user.stripeCustomerId);

    if (!activeSubscription) {
      res.status(400).json({ 
        error: 'No active subscription found. Please subscribe first.',
        code: 'NO_SUBSCRIPTION'
      });
      return;
    }

    // Update the subscription
    const updatedSubscription = await StripeService.updateSubscriptionPlan(
      activeSubscription.id,
      priceId,
      planId,
      billingInterval
    );

    // Update local database
    const localSub = await db.query.subscriptions.findFirst({
      where: eq(schema.subscriptions.stripeSubscriptionId, activeSubscription.id),
    });

    if (localSub) {
      await db.update(schema.subscriptions).set({
        plan: plan.slug,
        planId: plan.id,
        billingInterval,
        status: updatedSubscription.status,
        currentPeriodEnd: new Date(updatedSubscription.current_period_end * 1000),
        updatedAt: new Date(),
      }).where(eq(schema.subscriptions.id, localSub.id));
    }

    res.json({ 
      success: true, 
      message: `Plan changed to ${plan.name} (${billingInterval})`,
      subscription: {
        id: updatedSubscription.id,
        status: updatedSubscription.status,
        currentPeriodEnd: new Date(updatedSubscription.current_period_end * 1000),
      }
    });
  } catch (error) {
    console.error('Change plan error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to change plan' 
    });
  }
});

/**
 * POST /stripe/cleanup-subscriptions
 * Clean up duplicate subscriptions (admin/user utility)
 */
router.post('/cleanup-subscriptions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!stripe) {
      res.status(503).json({ error: 'Stripe is not configured' });
      return;
    }

    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, req.user!.id),
    });

    if (!user?.stripeCustomerId) {
      res.status(400).json({ error: 'No billing account found' });
      return;
    }

    // Get all subscriptions count before cleanup
    const beforeSubs = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'active',
    });

    await StripeService.cleanupDuplicateSubscriptions(user.stripeCustomerId);

    // Get count after cleanup
    const afterSubs = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'active',
    });

    res.json({ 
      success: true, 
      message: `Cleaned up ${beforeSubs.data.length - afterSubs.data.length} duplicate subscriptions`,
      activeSubscriptions: afterSubs.data.length
    });
  } catch (error) {
    console.error('Cleanup subscriptions error:', error);
    res.status(500).json({ error: 'Failed to cleanup subscriptions' });
  }
});

/**
 * POST /stripe/create-portal-session
 * Create Stripe Customer Portal Session
 */
router.post('/create-portal-session', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!StripeService.isConfigured()) {
      res.status(503).json({ error: 'Stripe is not configured' });
      return;
    }

    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, req.user!.id),
    });

    if (!user?.stripeCustomerId) {
      res.status(400).json({ error: 'No billing account found. Please subscribe to a plan first.' });
      return;
    }

    const url = await StripeService.createPortalSession({
      customerId: user.stripeCustomerId,
    });

    res.json({ url });
  } catch (error) {
    console.error('Create portal session error:', error);
    res.status(500).json({ error: 'Failed to create billing portal session' });
  }
});

/**
 * POST /stripe/create-setup-intent
 * Create SetupIntent for adding/updating payment method (production standard)
 */
router.post('/create-setup-intent', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!stripe) {
      res.status(503).json({ error: 'Stripe is not configured' });
      return;
    }

    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, req.user!.id),
    });

    if (!user?.stripeCustomerId) {
      res.status(400).json({ error: 'No billing account found. Please subscribe to a plan first.' });
      return;
    }

    // Create SetupIntent for future payments
    const setupIntent = await stripe.setupIntents.create({
      customer: user.stripeCustomerId,
      payment_method_types: ['card'],
      usage: 'off_session', // For recurring payments
    });

    res.json({
      clientSecret: setupIntent.client_secret,
    });
  } catch (error) {
    console.error('Create setup intent error:', error);
    res.status(500).json({ error: 'Failed to create setup intent' });
  }
});

/**
 * GET /stripe/payment-methods
 * Get customer's saved payment methods
 */
router.get('/payment-methods', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!stripe) {
      res.status(503).json({ error: 'Stripe is not configured' });
      return;
    }

    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, req.user!.id),
    });

    if (!user?.stripeCustomerId) {
      res.json({ paymentMethods: [], defaultPaymentMethodId: null });
      return;
    }

    // Get customer to find default payment method
    const customer = await stripe.customers.retrieve(user.stripeCustomerId);
    const defaultPaymentMethodId = !customer.deleted 
      ? (customer.invoice_settings?.default_payment_method as string) || null 
      : null;

    // Get all payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card',
    });

    const formattedMethods = paymentMethods.data.map(pm => ({
      id: pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
      isDefault: pm.id === defaultPaymentMethodId,
    }));

    res.json({
      paymentMethods: formattedMethods,
      defaultPaymentMethodId,
    });
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({ error: 'Failed to get payment methods' });
  }
});

/**
 * POST /stripe/set-default-payment-method
 * Set default payment method for customer
 */
router.post('/set-default-payment-method', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!stripe) {
      res.status(503).json({ error: 'Stripe is not configured' });
      return;
    }

    const { paymentMethodId } = req.body;

    if (!paymentMethodId) {
      res.status(400).json({ error: 'Payment method ID is required' });
      return;
    }

    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, req.user!.id),
    });

    if (!user?.stripeCustomerId) {
      res.status(400).json({ error: 'No billing account found' });
      return;
    }

    // Update customer's default payment method
    await stripe.customers.update(user.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Also update any active subscriptions to use this payment method
    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'active',
    });

    for (const sub of subscriptions.data) {
      await stripe.subscriptions.update(sub.id, {
        default_payment_method: paymentMethodId,
      });
    }

    res.json({ success: true, message: 'Default payment method updated' });
  } catch (error) {
    console.error('Set default payment method error:', error);
    res.status(500).json({ error: 'Failed to set default payment method' });
  }
});

/**
 * DELETE /stripe/payment-methods/:id
 * Delete a payment method
 */
router.delete('/payment-methods/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!stripe) {
      res.status(503).json({ error: 'Stripe is not configured' });
      return;
    }

    const paymentMethodId = req.params.id as string;

    if (!paymentMethodId) {
      res.status(400).json({ error: 'Payment method ID is required' });
      return;
    }

    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, req.user!.id),
    });

    if (!user?.stripeCustomerId) {
      res.status(400).json({ error: 'No billing account found' });
      return;
    }

    // Verify the payment method belongs to this customer
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (paymentMethod.customer !== user.stripeCustomerId) {
      res.status(403).json({ error: 'Payment method does not belong to this customer' });
      return;
    }

    // Detach the payment method
    await stripe.paymentMethods.detach(paymentMethodId);

    res.json({ success: true, message: 'Payment method removed' });
  } catch (error) {
    console.error('Delete payment method error:', error);
    res.status(500).json({ error: 'Failed to delete payment method' });
  }
});

/**
 * POST /stripe/webhook
 * Handle Stripe webhooks for subscription lifecycle events
 * Note: Raw body parsing is handled in index.ts before JSON parser
 */
router.post('/webhook', async (req: Request, res: Response) => {
    if (!stripe) {
      res.status(503).send('Stripe is not configured');
      return;
    }

    const sig = req.headers['stripe-signature'];
    const webhookSecret = STRIPE_WEBHOOK_SECRET;

    if (!sig) {
      console.error('Missing stripe-signature header');
      res.status(400).send('Missing signature');
      return;
    }

    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      res.status(400).send('Webhook secret not configured');
      return;
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Webhook signature verification failed:', message);
      res.status(400).send(`Webhook Error: ${message}`);
      return;
    }

    console.log(`Received webhook event: ${event.type}`);

    try {
      switch (event.type) {
        // Checkout completed - new subscription created
        case 'checkout.session.completed':
          await StripeService.handleCheckoutCompleted(
            event.data.object as Stripe.Checkout.Session
          );
          break;

        // Subscription updated (plan change, renewal, etc.)
        case 'customer.subscription.updated':
          await StripeService.handleSubscriptionUpdated(
            event.data.object as Stripe.Subscription
          );
          break;

        // Subscription deleted/canceled
        case 'customer.subscription.deleted':
          await StripeService.handleSubscriptionDeleted(
            event.data.object as Stripe.Subscription
          );
          break;

        // Invoice created (for upcoming renewal)
        case 'invoice.created':
          await StripeService.handleInvoiceCreated(event.data.object as Stripe.Invoice);
          break;

        // Payment successful (renewal or initial payment)
        case 'invoice.payment_succeeded':
          await StripeService.handleInvoicePaymentSucceeded(
            event.data.object as Stripe.Invoice
          );
          break;

        // Payment failed (renewal failed)
        case 'invoice.payment_failed':
          await StripeService.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        // Invoice finalized
        case 'invoice.finalized':
          console.log('Invoice finalized:', (event.data.object as Stripe.Invoice).id);
          break;

        // Customer created
        case 'customer.created':
          console.log('Customer created:', (event.data.object as Stripe.Customer).id);
          break;

        // Customer updated
        case 'customer.updated':
          console.log('Customer updated:', (event.data.object as Stripe.Customer).id);
          break;

        // Payment method attached
        case 'payment_method.attached':
          console.log(
            'Payment method attached:',
            (event.data.object as Stripe.PaymentMethod).id
          );
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook handler error:', error);
      // Still return 200 to prevent Stripe from retrying
      res.status(200).json({ received: true, error: 'Handler error' });
    }
  }
);

export default router;
