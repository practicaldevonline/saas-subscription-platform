import express, { Request, Response } from 'express';
import { PlansService } from '../services/plans.service.js';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware.js';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const createPlanSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  monthlyPrice: z.number().int().min(0),
  yearlyPrice: z.number().int().min(0),
  features: z.array(z.string()),
  maxUsers: z.number().int().min(1).optional().nullable(),
  maxTeamMembers: z.number().int().min(1).optional().nullable(),
  isPopular: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const updatePlanSchema = createPlanSchema.partial().extend({
  isActive: z.boolean().optional(),
});

/**
 * GET /plans
 * Get all active plans (public endpoint)
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const plans = await PlansService.getActivePlans();

    // Parse features and format for frontend
    const formattedPlans = plans.map((plan) => {
      const parsed = PlansService.parsePlanFeatures(plan);
      return {
        id: plan.id,
        name: plan.name,
        slug: plan.slug,
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
        yearlyPrice: plan.yearlyPrice,
        features: parsed.parsedFeatures,
        maxUsers: plan.maxUsers,
        maxTeamMembers: plan.maxTeamMembers,
        isPopular: plan.isPopular,
        sortOrder: plan.sortOrder,
        // Include Stripe price IDs for checkout
        stripePriceIdMonthly: plan.stripePriceIdMonthly,
        stripePriceIdYearly: plan.stripePriceIdYearly,
      };
    });

    res.json({ plans: formattedPlans });
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({ error: 'Failed to get plans' });
  }
});

/**
 * GET /plans/all
 * Get all plans including inactive (admin only)
 */
router.get('/all', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    // TODO: Add admin role check
    const plans = await PlansService.getAllPlans();

    const formattedPlans = plans.map((plan) => {
      const parsed = PlansService.parsePlanFeatures(plan);
      return {
        ...plan,
        features: parsed.parsedFeatures,
      };
    });

    res.json({ plans: formattedPlans });
  } catch (error) {
    console.error('Get all plans error:', error);
    res.status(500).json({ error: 'Failed to get plans' });
  }
});

/**
 * GET /plans/:id
 * Get a single plan by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const plan = await PlansService.getPlanById(req.params.id);

    if (!plan) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }

    const parsed = PlansService.parsePlanFeatures(plan);
    res.json({
      plan: {
        ...plan,
        features: parsed.parsedFeatures,
      },
    });
  } catch (error) {
    console.error('Get plan error:', error);
    res.status(500).json({ error: 'Failed to get plan' });
  }
});

/**
 * POST /plans
 * Create a new plan (admin only)
 */
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // TODO: Add admin role check
    const validatedData = createPlanSchema.parse(req.body);

    // Check if slug already exists
    const existingPlan = await PlansService.getPlanBySlug(validatedData.slug);
    if (existingPlan) {
      res.status(400).json({ error: 'A plan with this slug already exists' });
      return;
    }

    const plan = await PlansService.createPlan(validatedData);
    const parsed = PlansService.parsePlanFeatures(plan);

    res.status(201).json({
      plan: {
        ...plan,
        features: parsed.parsedFeatures,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    console.error('Create plan error:', error);
    res.status(500).json({ error: 'Failed to create plan' });
  }
});

/**
 * PUT /plans/:id
 * Update a plan (admin only)
 */
router.put('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // TODO: Add admin role check
    const validatedData = updatePlanSchema.parse(req.body);

    // Check if slug conflicts with another plan
    if (validatedData.slug) {
      const existingPlan = await PlansService.getPlanBySlug(validatedData.slug);
      if (existingPlan && existingPlan.id !== req.params.id) {
        res.status(400).json({ error: 'A plan with this slug already exists' });
        return;
      }
    }

    const plan = await PlansService.updatePlan(req.params.id, validatedData);

    if (!plan) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }

    const parsed = PlansService.parsePlanFeatures(plan);
    res.json({
      plan: {
        ...plan,
        features: parsed.parsedFeatures,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    console.error('Update plan error:', error);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

/**
 * DELETE /plans/:id
 * Delete a plan (soft delete, admin only)
 */
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // TODO: Add admin role check
    const success = await PlansService.deletePlan(req.params.id);

    if (!success) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }

    res.json({ message: 'Plan deleted successfully' });
  } catch (error) {
    console.error('Delete plan error:', error);
    res.status(500).json({ error: 'Failed to delete plan' });
  }
});

/**
 * POST /plans/:id/sync-stripe
 * Sync plan with Stripe (creates products and prices)
 */
router.post('/:id/sync-stripe', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // TODO: Add admin role check
    const plan = await PlansService.syncPlanWithStripe(req.params.id);

    if (!plan) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }

    const parsed = PlansService.parsePlanFeatures(plan);
    res.json({
      message: 'Plan synced with Stripe successfully',
      plan: {
        ...plan,
        features: parsed.parsedFeatures,
      },
    });
  } catch (error) {
    console.error('Sync plan with Stripe error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to sync plan with Stripe',
    });
  }
});

/**
 * POST /plans/seed
 * Seed default plans (admin only, useful for initial setup)
 */
router.post('/seed', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    // TODO: Add admin role check
    await PlansService.seedDefaultPlans();
    const plans = await PlansService.getAllPlans();

    res.json({
      message: 'Default plans seeded successfully',
      plans: plans.map((p) => ({
        ...p,
        features: PlansService.parsePlanFeatures(p).parsedFeatures,
      })),
    });
  } catch (error) {
    console.error('Seed plans error:', error);
    res.status(500).json({ error: 'Failed to seed plans' });
  }
});

export default router;
