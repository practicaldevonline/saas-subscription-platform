import { db, schema } from '../db/index.js';
import { eq, asc } from 'drizzle-orm';
import { stripe } from './stripe.service.js';
import type { Plan, NewPlan } from '../db/schema.js';

export interface CreatePlanInput {
  name: string;
  slug: string;
  description?: string;
  monthlyPrice: number; // in cents
  yearlyPrice: number; // in cents
  features: string[];
  maxUsers?: number;
  maxTeamMembers?: number;
  isPopular?: boolean;
  sortOrder?: number;
}

export interface UpdatePlanInput extends Partial<CreatePlanInput> {
  isActive?: boolean;
}

export class PlansService {
  /**
   * Get all active plans
   */
  static async getActivePlans(): Promise<Plan[]> {
    const plans = await db.query.plans.findMany({
      where: eq(schema.plans.isActive, true),
    });

    return plans.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /**
   * Get all plans (including inactive)
   */
  static async getAllPlans(): Promise<Plan[]> {
    const plans = await db.query.plans.findMany();
    return plans.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /**
   * Get a plan by ID
   */
  static async getPlanById(id: string): Promise<Plan | undefined> {
    return await db.query.plans.findFirst({
      where: eq(schema.plans.id, id),
    });
  }

  /**
   * Get a plan by slug
   */
  static async getPlanBySlug(slug: string): Promise<Plan | undefined> {
    return await db.query.plans.findFirst({
      where: eq(schema.plans.slug, slug),
    });
  }

  /**
   * Create a new plan
   * @param input - Plan input data
   * @param syncWithStripe - Whether to automatically sync with Stripe (default: true)
   */
  static async createPlan(input: CreatePlanInput, syncWithStripe: boolean = true): Promise<Plan> {
    const id = crypto.randomUUID();
    const now = new Date();

    const plan: NewPlan = {
      id,
      name: input.name,
      slug: input.slug,
      description: input.description || null,
      monthlyPrice: input.monthlyPrice,
      yearlyPrice: input.yearlyPrice,
      features: JSON.stringify(input.features),
      maxUsers: input.maxUsers || null,
      maxTeamMembers: input.maxTeamMembers || null,
      isPopular: input.isPopular || false,
      isActive: true,
      sortOrder: input.sortOrder || 0,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(schema.plans).values(plan);

    let createdPlan = (await this.getPlanById(id))!;

    // Auto-sync with Stripe if configured
    if (syncWithStripe && stripe) {
      try {
        createdPlan = (await this.syncPlanWithStripe(id))!;
        console.log(`Plan "${input.name}" synced with Stripe`);
      } catch (error) {
        console.error(`Failed to sync plan "${input.name}" with Stripe:`, error);
        // Plan is still created locally, just not synced
      }
    }

    return createdPlan;
  }

  /**
   * Update a plan
   */
  static async updatePlan(id: string, input: UpdatePlanInput): Promise<Plan | null> {
    const existingPlan = await this.getPlanById(id);
    if (!existingPlan) return null;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.slug !== undefined) updateData.slug = input.slug;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.monthlyPrice !== undefined) updateData.monthlyPrice = input.monthlyPrice;
    if (input.yearlyPrice !== undefined) updateData.yearlyPrice = input.yearlyPrice;
    if (input.features !== undefined) updateData.features = JSON.stringify(input.features);
    if (input.maxUsers !== undefined) updateData.maxUsers = input.maxUsers;
    if (input.maxTeamMembers !== undefined) updateData.maxTeamMembers = input.maxTeamMembers;
    if (input.isPopular !== undefined) updateData.isPopular = input.isPopular;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;
    if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;

    await db
      .update(schema.plans)
      .set(updateData)
      .where(eq(schema.plans.id, id));

    return (await this.getPlanById(id))!;
  }

  /**
   * Delete a plan (soft delete by setting isActive to false)
   */
  static async deletePlan(id: string): Promise<boolean> {
    const existingPlan = await this.getPlanById(id);
    if (!existingPlan) return false;

    await db
      .update(schema.plans)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(schema.plans.id, id));

    return true;
  }

  /**
   * Sync plan with Stripe - creates products and prices in Stripe
   */
  static async syncPlanWithStripe(planId: string): Promise<Plan | null> {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    const plan = await this.getPlanById(planId);
    if (!plan) return null;

    // Create or update Stripe product
    let stripeProduct;
    
    // Search for existing product by metadata
    const existingProducts = await stripe.products.search({
      query: `metadata['plan_id']:'${planId}'`,
    });

    if (existingProducts.data.length > 0) {
      // Update existing product
      stripeProduct = await stripe.products.update(existingProducts.data[0].id, {
        name: plan.name,
        description: plan.description || undefined,
        active: plan.isActive,
      });
    } else {
      // Create new product
      stripeProduct = await stripe.products.create({
        name: plan.name,
        description: plan.description || undefined,
        metadata: { plan_id: planId },
      });
    }

    // Create monthly price if it doesn't exist
    let monthlyPriceId = plan.stripePriceIdMonthly;
    if (!monthlyPriceId) {
      const monthlyPrice = await stripe.prices.create({
        product: stripeProduct.id,
        unit_amount: plan.monthlyPrice,
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: { plan_id: planId, interval: 'monthly' },
      });
      monthlyPriceId = monthlyPrice.id;
    }

    // Create yearly price if it doesn't exist
    let yearlyPriceId = plan.stripePriceIdYearly;
    if (!yearlyPriceId) {
      const yearlyPrice = await stripe.prices.create({
        product: stripeProduct.id,
        unit_amount: plan.yearlyPrice,
        currency: 'usd',
        recurring: { interval: 'year' },
        metadata: { plan_id: planId, interval: 'yearly' },
      });
      yearlyPriceId = yearlyPrice.id;
    }

    // Update plan with Stripe price IDs
    await db
      .update(schema.plans)
      .set({
        stripePriceIdMonthly: monthlyPriceId,
        stripePriceIdYearly: yearlyPriceId,
        updatedAt: new Date(),
      })
      .where(eq(schema.plans.id, planId));

    return (await this.getPlanById(planId))!;
  }

  /**
   * Sync all active plans with Stripe
   * Creates products and prices for plans that don't have Stripe IDs yet
   */
  static async syncAllPlansWithStripe(): Promise<{
    synced: string[];
    failed: { planId: string; name: string; error: string }[];
    skipped: string[];
  }> {
    if (!stripe) {
      console.log('Stripe is not configured, skipping plan sync');
      return { synced: [], failed: [], skipped: [] };
    }

    const plans = await this.getActivePlans();
    const results: {
      synced: string[];
      failed: { planId: string; name: string; error: string }[];
      skipped: string[];
    } = { synced: [], failed: [], skipped: [] };

    for (const plan of plans) {
      // Skip if already synced (has both price IDs)
      if (plan.stripePriceIdMonthly && plan.stripePriceIdYearly) {
        results.skipped.push(plan.name);
        continue;
      }

      try {
        await this.syncPlanWithStripe(plan.id);
        results.synced.push(plan.name);
        console.log(`Synced plan "${plan.name}" with Stripe`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.failed.push({ planId: plan.id, name: plan.name, error: errorMessage });
        console.error(`Failed to sync plan "${plan.name}" with Stripe:`, errorMessage);
      }
    }

    return results;
  }

  /**
   * Get plan with parsed features
   */
  static parsePlanFeatures(plan: Plan): Plan & { parsedFeatures: string[] } {
    let parsedFeatures: string[] = [];
    try {
      parsedFeatures = JSON.parse(plan.features);
    } catch {
      parsedFeatures = [];
    }
    return { ...plan, parsedFeatures };
  }

  /**
   * Seed default plans
   */
  static async seedDefaultPlans(): Promise<void> {
    const existingPlans = await this.getAllPlans();
    if (existingPlans.length > 0) {
      console.log('Plans already exist, skipping seed');
      return;
    }

    const defaultPlans: CreatePlanInput[] = [
      {
        name: 'Starter',
        slug: 'starter',
        description: 'Perfect for individuals and small projects',
        monthlyPrice: 1900, // $19
        yearlyPrice: 18200, // $182 (save ~20%)
        features: [
          'Up to 1,000 users',
          'Basic analytics',
          'Email support',
          '1 team member',
        ],
        maxUsers: 1000,
        maxTeamMembers: 1,
        isPopular: false,
        sortOrder: 1,
      },
      {
        name: 'Professional',
        slug: 'professional',
        description: 'Best for growing businesses',
        monthlyPrice: 4900, // $49
        yearlyPrice: 47000, // $470 (save ~20%)
        features: [
          'Up to 10,000 users',
          'Advanced analytics',
          'Priority support',
          '5 team members',
          'Custom integrations',
        ],
        maxUsers: 10000,
        maxTeamMembers: 5,
        isPopular: true,
        sortOrder: 2,
      },
      {
        name: 'Enterprise',
        slug: 'enterprise',
        description: 'For large organizations',
        monthlyPrice: 9900, // $99
        yearlyPrice: 95000, // $950 (save ~20%)
        features: [
          'Unlimited users',
          'Enterprise analytics',
          '24/7 phone support',
          'Unlimited team members',
          'Custom integrations',
          'SLA guarantee',
        ],
        maxUsers: null, // unlimited
        maxTeamMembers: null, // unlimited
        isPopular: false,
        sortOrder: 3,
      },
    ];

    for (const plan of defaultPlans) {
      // Don't sync with Stripe during seeding - we'll sync all at once after
      await this.createPlan(plan, false);
    }

    console.log('Default plans seeded successfully');
  }
}
