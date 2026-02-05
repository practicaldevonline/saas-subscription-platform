import express, { Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/admin.middleware.js';
import { AdminService } from '../services/admin.service.js';
import { PlansService } from '../services/plans.service.js';
import { z } from 'zod';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(requireAuth);
router.use(requireAdmin);

/**
 * GET /admin/dashboard
 * Get admin dashboard stats
 */
router.get('/dashboard', async (_req: AuthRequest, res: Response) => {
  try {
    const stats = await AdminService.getDashboardStats();
    res.json(stats);
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
});

// ===== USERS MANAGEMENT =====

/**
 * GET /admin/users
 * Get all users
 */
router.get('/users', async (_req: AuthRequest, res: Response) => {
  try {
    const users = await AdminService.getAllUsers();
    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

/**
 * POST /admin/users/create-admin
 * Create a new admin user
 */
router.post('/users/create-admin', async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password are required' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const result = await AdminService.createAdminUser(name, email, password);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json({ message: 'Admin user created successfully', userId: result.userId });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ error: 'Failed to create admin user' });
  }
});

/**
 * PUT /admin/users/:id/role
 * Update user role
 */
router.put('/users/:id/role', async (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.body;

    if (!role || !['user', 'admin'].includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    const success = await AdminService.updateUserRole(req.params.id, role);

    if (!success) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ message: 'User role updated' });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

/**
 * DELETE /admin/users/:id
 * Delete a user
 */
router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    // Prevent deleting yourself
    if (req.params.id === req.user?.id) {
      res.status(400).json({ error: 'You cannot delete your own account' });
      return;
    }

    const success = await AdminService.deleteUser(req.params.id);

    if (!success) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ===== PLANS MANAGEMENT =====

const planSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional().nullable(),
  monthlyPrice: z.number().int().min(0),
  yearlyPrice: z.number().int().min(0),
  features: z.array(z.string()),
  maxUsers: z.number().int().min(1).optional().nullable(),
  maxTeamMembers: z.number().int().min(1).optional().nullable(),
  isPopular: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

/**
 * GET /admin/plans
 * Get all plans (including inactive)
 */
router.get('/plans', async (_req: AuthRequest, res: Response) => {
  try {
    const plans = await PlansService.getAllPlans();
    const formattedPlans = plans.map((plan) => ({
      ...plan,
      features: PlansService.parsePlanFeatures(plan).parsedFeatures,
    }));
    res.json({ plans: formattedPlans });
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({ error: 'Failed to get plans' });
  }
});

/**
 * POST /admin/plans
 * Create a new plan
 */
router.post('/plans', async (req: AuthRequest, res: Response) => {
  try {
    const validatedData = planSchema.parse(req.body);

    const existingPlan = await PlansService.getPlanBySlug(validatedData.slug);
    if (existingPlan) {
      res.status(400).json({ error: 'A plan with this slug already exists' });
      return;
    }

    const plan = await PlansService.createPlan({
      ...validatedData,
      description: validatedData.description || undefined,
      maxUsers: validatedData.maxUsers || undefined,
      maxTeamMembers: validatedData.maxTeamMembers || undefined,
    });

    res.status(201).json({
      plan: {
        ...plan,
        features: PlansService.parsePlanFeatures(plan).parsedFeatures,
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
 * PUT /admin/plans/:id
 * Update a plan
 */
router.put('/plans/:id', async (req: AuthRequest, res: Response) => {
  try {
    const validatedData = planSchema.partial().parse(req.body);

    if (validatedData.slug) {
      const existingPlan = await PlansService.getPlanBySlug(validatedData.slug);
      if (existingPlan && existingPlan.id !== req.params.id) {
        res.status(400).json({ error: 'A plan with this slug already exists' });
        return;
      }
    }

    const plan = await PlansService.updatePlan(req.params.id, {
      ...validatedData,
      description: validatedData.description || undefined,
      maxUsers: validatedData.maxUsers || undefined,
      maxTeamMembers: validatedData.maxTeamMembers || undefined,
    });

    if (!plan) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }

    res.json({
      plan: {
        ...plan,
        features: PlansService.parsePlanFeatures(plan).parsedFeatures,
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
 * DELETE /admin/plans/:id
 * Delete a plan (soft delete)
 */
router.delete('/plans/:id', async (req: AuthRequest, res: Response) => {
  try {
    const success = await PlansService.deletePlan(req.params.id);

    if (!success) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }

    res.json({ message: 'Plan deleted' });
  } catch (error) {
    console.error('Delete plan error:', error);
    res.status(500).json({ error: 'Failed to delete plan' });
  }
});

/**
 * POST /admin/plans/:id/sync-stripe
 * Sync a plan with Stripe
 */
router.post('/plans/:id/sync-stripe', async (req: AuthRequest, res: Response) => {
  try {
    const plan = await PlansService.syncPlanWithStripe(req.params.id);

    if (!plan) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }

    res.json({
      message: 'Plan synced with Stripe',
      plan: {
        ...plan,
        features: PlansService.parsePlanFeatures(plan).parsedFeatures,
      },
    });
  } catch (error) {
    console.error('Sync plan error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to sync plan with Stripe',
    });
  }
});

/**
 * POST /admin/plans/sync-all
 * Sync all active plans with Stripe
 */
router.post('/plans/sync-all', async (_req: AuthRequest, res: Response) => {
  try {
    const plans = await PlansService.getActivePlans();
    const results: { planId: string; name: string; success: boolean; error?: string }[] = [];

    for (const plan of plans) {
      try {
        await PlansService.syncPlanWithStripe(plan.id);
        results.push({ planId: plan.id, name: plan.name, success: true });
      } catch (error) {
        results.push({
          planId: plan.id,
          name: plan.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    res.json({
      message: `Synced ${successful} plans successfully${failed > 0 ? `, ${failed} failed` : ''}`,
      results,
    });
  } catch (error) {
    console.error('Sync all plans error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to sync plans with Stripe',
    });
  }
});

// ===== SETTINGS MANAGEMENT =====

/**
 * GET /admin/settings
 * Get all settings
 */
router.get('/settings', async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await AdminService.getAllSettings();
    res.json({ settings });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

/**
 * PUT /admin/settings/:key
 * Update a setting
 */
router.put('/settings/:key', async (req: AuthRequest, res: Response) => {
  try {
    const { value, description, isPublic } = req.body;

    if (value === undefined) {
      res.status(400).json({ error: 'Value is required' });
      return;
    }

    const setting = await AdminService.setSetting(req.params.key, value, description, isPublic);
    res.json({ setting });
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

/**
 * DELETE /admin/settings/:key
 * Delete a setting
 */
router.delete('/settings/:key', async (req: AuthRequest, res: Response) => {
  try {
    const success = await AdminService.deleteSetting(req.params.key);

    if (!success) {
      res.status(404).json({ error: 'Setting not found' });
      return;
    }

    res.json({ message: 'Setting deleted' });
  } catch (error) {
    console.error('Delete setting error:', error);
    res.status(500).json({ error: 'Failed to delete setting' });
  }
});

export default router;
