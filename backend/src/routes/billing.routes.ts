import express, { Response } from 'express';
import { StripeService } from '../services/stripe.service.js';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * GET /billing/invoices
 * Get current user's invoice history
 */
router.get('/invoices', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const invoices = await StripeService.getUserInvoices(req.user!.id);
    res.json({ invoices });
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: 'Failed to get invoices' });
  }
});

export default router;
