import Stripe from 'stripe';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { STRIPE_SECRET_KEY, FRONTEND_URL } from '../config/env.js';

// Initialize Stripe only if key is provided
export const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' })
  : null;

export interface CreateCheckoutSessionParams {
  userId: string;
  userEmail: string;
  planId: string;
  billingInterval: 'monthly' | 'yearly';
}

export interface CreatePortalSessionParams {
  customerId: string;
}

export class StripeService {
  private static ensureStripe(): Stripe {
    if (!stripe) {
      throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in environment.');
    }
    return stripe;
  }

  /**
   * Create or get Stripe customer for user
   */
  static async getOrCreateCustomer(userId: string, email: string): Promise<string> {
    const stripeClient = this.ensureStripe();

    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });

    if (user?.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    const customer = await stripeClient.customers.create({
      email,
      metadata: { userId },
    });

    await db
      .update(schema.users)
      .set({ stripeCustomerId: customer.id })
      .where(eq(schema.users.id, userId));

    return customer.id;
  }

  /**
   * Get user's active Stripe subscription
   */
  static async getActiveStripeSubscription(customerId: string): Promise<Stripe.Subscription | null> {
    const stripeClient = this.ensureStripe();
    
    const subscriptions = await stripeClient.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    return subscriptions.data[0] || null;
  }

  /**
   * Cancel all duplicate subscriptions, keeping only the most recent one
   */
  static async cleanupDuplicateSubscriptions(customerId: string): Promise<void> {
    const stripeClient = this.ensureStripe();
    
    // Get all active subscriptions
    const subscriptions = await stripeClient.subscriptions.list({
      customer: customerId,
      status: 'active',
    });

    if (subscriptions.data.length <= 1) {
      return; // No duplicates
    }

    // Sort by created date, keep the most recent
    const sorted = subscriptions.data.sort((a, b) => b.created - a.created);
    const toKeep = sorted[0];
    const toCancel = sorted.slice(1);

    console.log(`Cleaning up ${toCancel.length} duplicate subscriptions for customer ${customerId}`);

    for (const sub of toCancel) {
      try {
        await stripeClient.subscriptions.cancel(sub.id);
        console.log(`Canceled duplicate subscription: ${sub.id}`);
      } catch (error) {
        console.error(`Failed to cancel subscription ${sub.id}:`, error);
      }
    }
  }

  /**
   * Update existing subscription to a new plan (for plan changes)
   */
  static async updateSubscriptionPlan(
    subscriptionId: string,
    newPriceId: string,
    planId: string,
    billingInterval: 'monthly' | 'yearly'
  ): Promise<Stripe.Subscription> {
    const stripeClient = this.ensureStripe();

    // Get the current subscription
    const subscription = await stripeClient.subscriptions.retrieve(subscriptionId);
    const currentItemId = subscription.items.data[0]?.id;

    if (!currentItemId) {
      throw new Error('No subscription item found');
    }

    // Update the subscription with the new price
    const updatedSubscription = await stripeClient.subscriptions.update(subscriptionId, {
      items: [
        {
          id: currentItemId,
          price: newPriceId,
        },
      ],
      proration_behavior: 'create_prorations', // Standard SaaS behavior: prorate the change
      metadata: {
        planId,
        billingInterval,
      },
    });

    return updatedSubscription;
  }

  /**
   * Create Stripe Checkout Session for NEW subscription only
   * If user already has a subscription, throws an error (use updateSubscriptionPlan instead)
   */
  static async createCheckoutSession(params: CreateCheckoutSessionParams): Promise<string> {
    const stripeClient = this.ensureStripe();
    const { userId, userEmail, planId, billingInterval } = params;

    // Get the plan from database
    const plan = await db.query.plans.findFirst({
      where: eq(schema.plans.id, planId),
    });

    if (!plan) {
      throw new Error('Plan not found');
    }

    // Get the correct price ID based on billing interval
    const priceId =
      billingInterval === 'monthly' ? plan.stripePriceIdMonthly : plan.stripePriceIdYearly;

    if (!priceId) {
      throw new Error(
        `Stripe price not configured for ${plan.name} (${billingInterval}). Please sync the plan with Stripe first.`
      );
    }

    const customerId = await this.getOrCreateCustomer(userId, userEmail);

    // Check if customer already has an active subscription
    const existingSubscription = await this.getActiveStripeSubscription(customerId);
    
    if (existingSubscription) {
      // Clean up any duplicates first
      await this.cleanupDuplicateSubscriptions(customerId);
      
      // User already has a subscription - they should use plan change instead
      throw new Error('EXISTING_SUBSCRIPTION');
    }

    const session = await stripeClient.checkout.sessions.create({
      customer: customerId,
      // Use automatic payment methods - shows all methods enabled in Stripe Dashboard
      // This includes: Cards, Google Pay, Apple Pay, Bank transfers (ACH/SEPA), etc.
      // To enable bank payments: Go to Stripe Dashboard > Settings > Payment methods
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${FRONTEND_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/pricing`,
      metadata: { userId, planId, billingInterval },
      // Allow customers to adjust quantity if needed (set to false for fixed plans)
      allow_promotion_codes: true, // Enable promo/coupon codes (production standard)
      billing_address_collection: 'auto',
      // Prevent creating duplicate subscriptions
      subscription_data: {
        metadata: { userId, planId, billingInterval },
      },
      // Let Stripe determine the best payment methods based on customer location
      payment_method_collection: 'always',
    });

    return session.url!;
  }

  /**
   * Create Stripe Customer Portal Session
   */
  static async createPortalSession(params: CreatePortalSessionParams): Promise<string> {
    const stripeClient = this.ensureStripe();

    const session = await stripeClient.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: `${FRONTEND_URL}/billing`,
    });

    return session.url;
  }

  /**
   * Handle checkout.session.completed webhook
   */
  static async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const stripeClient = this.ensureStripe();
    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;
    const billingInterval = session.metadata?.billingInterval as 'monthly' | 'yearly';

    if (!userId || !planId || !billingInterval) {
      console.error('Missing metadata in session');
      return;
    }

    // Get plan details to get the slug for the legacy 'plan' column
    const planDetails = await db.query.plans.findFirst({
      where: eq(schema.plans.id, planId),
    });

    if (!planDetails) {
      console.error('Plan not found:', planId);
      return;
    }

    const subscriptionId = session.subscription as string;
    const subscription = await stripeClient.subscriptions.retrieve(subscriptionId);

    const existingSub = await db.query.subscriptions.findFirst({
      where: eq(schema.subscriptions.stripeSubscriptionId, subscription.id),
    });

    const subscriptionData = {
      status: subscription.status,
      plan: planDetails.slug, // Legacy column - stores plan slug
      planId, // New column - stores plan ID
      billingInterval,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      updatedAt: new Date(),
    };

    if (existingSub) {
      await db
        .update(schema.subscriptions)
        .set(subscriptionData)
        .where(eq(schema.subscriptions.id, existingSub.id));
    } else {
      await db.insert(schema.subscriptions).values({
        id: crypto.randomUUID(),
        userId,
        stripeSubscriptionId: subscription.id,
        ...subscriptionData,
        createdAt: new Date(),
      });
    }

    console.log(`Subscription created/updated for user ${userId} with plan ${planDetails.name}`);
  }

  /**
   * Handle customer.subscription.updated webhook
   * This handles plan changes, renewals, and status updates
   */
  static async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const existingSub = await db.query.subscriptions.findFirst({
      where: eq(schema.subscriptions.stripeSubscriptionId, subscription.id),
    });

    if (!existingSub) {
      console.error('Subscription not found:', subscription.id);
      return;
    }

    // Get the current price ID from the subscription to detect plan changes
    const currentPriceId = subscription.items.data[0]?.price?.id;
    const currentInterval = subscription.items.data[0]?.price?.recurring?.interval;
    
    // Determine billing interval from Stripe's interval
    const billingInterval = currentInterval === 'year' ? 'yearly' : 'monthly';

    // Try to find the plan by the Stripe price ID
    let planDetails = null;
    if (currentPriceId) {
      // Search for plan by monthly or yearly price ID
      const allPlans = await db.query.plans.findMany();
      planDetails = allPlans.find(
        p => p.stripePriceIdMonthly === currentPriceId || p.stripePriceIdYearly === currentPriceId
      );
    }

    const updateData: Record<string, unknown> = {
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      billingInterval,
      updatedAt: new Date(),
    };

    // Update plan info if we found the plan
    if (planDetails) {
      updateData.plan = planDetails.slug;
      updateData.planId = planDetails.id;
      console.log(`Subscription ${subscription.id} updated to plan: ${planDetails.name} (${billingInterval})`);
    }

    await db
      .update(schema.subscriptions)
      .set(updateData)
      .where(eq(schema.subscriptions.id, existingSub.id));
  }

  /**
   * Handle customer.subscription.deleted webhook
   */
  static async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const existingSub = await db.query.subscriptions.findFirst({
      where: eq(schema.subscriptions.stripeSubscriptionId, subscription.id),
    });

    if (existingSub) {
      await db
        .update(schema.subscriptions)
        .set({ status: 'canceled', updatedAt: new Date() })
        .where(eq(schema.subscriptions.id, existingSub.id));
    }
  }

  /**
   * Handle invoice.created webhook
   */
  static async handleInvoiceCreated(invoice: Stripe.Invoice): Promise<void> {
    const stripeClient = this.ensureStripe();
    if (!invoice.customer) return;

    try {
      const customer = await stripeClient.customers.retrieve(invoice.customer as string);
      if (customer.deleted) return;

      const userId = customer.metadata?.userId;
      if (!userId) return;

      const existingInvoice = await db.query.invoices.findFirst({
        where: eq(schema.invoices.stripeInvoiceId, invoice.id),
      });

      if (!existingInvoice) {
        await db.insert(schema.invoices).values({
          id: crypto.randomUUID(),
          userId,
          stripeInvoiceId: invoice.id,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          status: invoice.status || 'draft',
          invoicePdfUrl: invoice.invoice_pdf || null,
          periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
          periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
          createdAt: new Date(),
        });
      }
    } catch (error) {
      console.error('Error creating invoice:', error);
    }
  }

  /**
   * Handle invoice.payment_succeeded webhook
   * This handles both initial payments and renewal payments
   */
  static async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const stripeClient = this.ensureStripe();

    // Update or create invoice record
    const existingInvoice = await db.query.invoices.findFirst({
      where: eq(schema.invoices.stripeInvoiceId, invoice.id),
    });

    if (!existingInvoice) {
      await this.handleInvoiceCreated(invoice);
    } else {
      await db
        .update(schema.invoices)
        .set({
          status: 'paid',
          amountPaid: invoice.amount_paid,
          invoicePdfUrl: invoice.invoice_pdf || null,
        })
        .where(eq(schema.invoices.id, existingInvoice.id));
    }

    // If this is a subscription invoice, update the subscription period
    if (invoice.subscription) {
      try {
        const subscription = await stripeClient.subscriptions.retrieve(
          invoice.subscription as string
        );

        const existingSub = await db.query.subscriptions.findFirst({
          where: eq(schema.subscriptions.stripeSubscriptionId, subscription.id),
        });

        if (existingSub) {
          await db
            .update(schema.subscriptions)
            .set({
              status: subscription.status,
              currentPeriodStart: new Date(subscription.current_period_start * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              updatedAt: new Date(),
            })
            .where(eq(schema.subscriptions.id, existingSub.id));

          console.log(`Updated subscription ${existingSub.id} after payment succeeded`);
        }
      } catch (error) {
        console.error('Error updating subscription after payment:', error);
      }
    }
  }

  /**
   * Handle invoice.payment_failed webhook
   * This handles failed renewal payments and marks subscriptions as past_due
   */
  static async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const stripeClient = this.ensureStripe();

    // Update or create invoice record
    const existingInvoice = await db.query.invoices.findFirst({
      where: eq(schema.invoices.stripeInvoiceId, invoice.id),
    });

    if (!existingInvoice) {
      await this.handleInvoiceCreated(invoice);
    } else {
      await db
        .update(schema.invoices)
        .set({ status: invoice.status || 'open' })
        .where(eq(schema.invoices.id, existingInvoice.id));
    }

    // If this is a subscription invoice, update subscription status to past_due
    if (invoice.subscription) {
      try {
        const subscription = await stripeClient.subscriptions.retrieve(
          invoice.subscription as string
        );

        const existingSub = await db.query.subscriptions.findFirst({
          where: eq(schema.subscriptions.stripeSubscriptionId, subscription.id),
        });

        if (existingSub) {
          await db
            .update(schema.subscriptions)
            .set({
              status: subscription.status, // Will be 'past_due' after payment failure
              updatedAt: new Date(),
            })
            .where(eq(schema.subscriptions.id, existingSub.id));

          console.log(
            `Updated subscription ${existingSub.id} to ${subscription.status} after payment failed`
          );
        }
      } catch (error) {
        console.error('Error updating subscription after payment failure:', error);
      }
    }
  }

  /**
   * Get user's subscription status with plan details
   */
  static async getUserSubscription(userId: string) {
    const subscription = await db.query.subscriptions.findFirst({
      where: eq(schema.subscriptions.userId, userId),
    });

    if (!subscription) return null;

    // Get plan details
    let plan = null;
    if (subscription.planId) {
      plan = await db.query.plans.findFirst({
        where: eq(schema.plans.id, subscription.planId),
      });
    }

    return {
      ...subscription,
      plan: plan
        ? {
            id: plan.id,
            name: plan.name,
            slug: plan.slug,
          }
        : null,
    };
  }

  /**
   * Get user's invoices
   */
  static async getUserInvoices(userId: string) {
    const invoices = await db.query.invoices.findMany({
      where: eq(schema.invoices.userId, userId),
    });

    return invoices.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });
  }

  /**
   * Check if Stripe is configured
   */
  static isConfigured(): boolean {
    return stripe !== null;
  }
}
