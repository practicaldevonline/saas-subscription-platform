import express, { Response } from 'express';
import { StripeService, stripe } from '../services/stripe.service.js';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

const router = express.Router();

/**
 * GET /subscription/status
 * Get current user's subscription status with plan details
 */
router.get('/status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const subscription = await StripeService.getUserSubscription(req.user!.id);

    if (!subscription) {
      res.json({ subscription: null });
      return;
    }

    // Ensure dates are properly serialized
    res.json({
      subscription: {
        ...subscription,
        currentPeriodStart: subscription.currentPeriodStart
          ? new Date(subscription.currentPeriodStart).toISOString()
          : null,
        currentPeriodEnd: subscription.currentPeriodEnd
          ? new Date(subscription.currentPeriodEnd).toISOString()
          : null,
        createdAt: subscription.createdAt
          ? new Date(subscription.createdAt).toISOString()
          : null,
        updatedAt: subscription.updatedAt
          ? new Date(subscription.updatedAt).toISOString()
          : null,
      },
    });
  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

/**
 * POST /subscription/cancel
 * Cancel the current subscription at period end
 */
router.post('/cancel', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!stripe) {
      res.status(503).json({ error: 'Stripe is not configured' });
      return;
    }

    const subscription = await db.query.subscriptions.findFirst({
      where: eq(schema.subscriptions.userId, req.user!.id),
    });

    if (!subscription || !subscription.stripeSubscriptionId) {
      res.status(404).json({ error: 'No active subscription found' });
      return;
    }

    // Cancel at period end (user keeps access until the end of billing period)
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Update local database
    await db
      .update(schema.subscriptions)
      .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
      .where(eq(schema.subscriptions.id, subscription.id));

    res.json({ message: 'Subscription will be canceled at the end of the billing period' });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

/**
 * POST /subscription/reactivate
 * Reactivate a subscription that was set to cancel
 */
router.post('/reactivate', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!stripe) {
      res.status(503).json({ error: 'Stripe is not configured' });
      return;
    }

    const subscription = await db.query.subscriptions.findFirst({
      where: eq(schema.subscriptions.userId, req.user!.id),
    });

    if (!subscription || !subscription.stripeSubscriptionId) {
      res.status(404).json({ error: 'No subscription found' });
      return;
    }

    if (!subscription.cancelAtPeriodEnd) {
      res.status(400).json({ error: 'Subscription is not set to cancel' });
      return;
    }

    // Remove cancellation
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    // Update local database
    await db
      .update(schema.subscriptions)
      .set({ cancelAtPeriodEnd: false, updatedAt: new Date() })
      .where(eq(schema.subscriptions.id, subscription.id));

    res.json({ message: 'Subscription reactivated' });
  } catch (error) {
    console.error('Reactivate subscription error:', error);
    res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
});

/**
 * POST /subscription/change-plan
 * Change to a different plan (upgrade/downgrade)
 */
router.post('/change-plan', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!stripe) {
      res.status(503).json({ error: 'Stripe is not configured' });
      return;
    }

    const { planId, billingInterval } = req.body;

    if (!planId || !billingInterval) {
      res.status(400).json({ error: 'Plan ID and billing interval are required' });
      return;
    }

    const subscription = await db.query.subscriptions.findFirst({
      where: eq(schema.subscriptions.userId, req.user!.id),
    });

    if (!subscription || !subscription.stripeSubscriptionId) {
      res.status(404).json({ error: 'No active subscription found' });
      return;
    }

    // Get the new plan
    const newPlan = await db.query.plans.findFirst({
      where: eq(schema.plans.id, planId),
    });

    if (!newPlan) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }

    const newPriceId =
      billingInterval === 'monthly' ? newPlan.stripePriceIdMonthly : newPlan.stripePriceIdYearly;

    if (!newPriceId) {
      res.status(400).json({ error: 'Plan is not available for purchase' });
      return;
    }

    // Get the current Stripe subscription
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );

    // Update the subscription with the new price
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      items: [
        {
          id: stripeSubscription.items.data[0].id,
          price: newPriceId,
        },
      ],
      proration_behavior: 'create_prorations',
    });

    // Update local database
    await db
      .update(schema.subscriptions)
      .set({
        planId,
        billingInterval,
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.id, subscription.id));

    res.json({ message: 'Plan changed successfully' });
  } catch (error) {
    console.error('Change plan error:', error);
    res.status(500).json({ error: 'Failed to change plan' });
  }
});

export default router;
