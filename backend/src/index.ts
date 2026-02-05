// Import config FIRST - this loads environment variables before any other imports
import { PORT, FRONTEND_URL, NODE_ENV } from './config/env.js';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth.js';
import stripeRoutes from './routes/stripe.routes.js';
import subscriptionRoutes from './routes/subscription.routes.js';
import billingRoutes from './routes/billing.routes.js';
import plansRoutes from './routes/plans.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { PlansService } from './services/plans.service.js';
import { AdminService } from './services/admin.service.js';

const app = express();

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

// Raw body for Stripe webhooks
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// JSON body parser for all other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Better Auth routes
app.all('/api/auth/*', toNodeHandler(auth));

// API Routes
app.use('/api/plans', plansRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/admin', adminRoutes);

// Error handling middleware
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('Error:', err);
    res.status(500).json({
      error: err.message || 'Internal server error',
    });
  }
);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Initialize: seed admin and plans on startup, then sync plans with Stripe
async function initialize() {
  try {
    await AdminService.seedDefaultAdmin();
    await PlansService.seedDefaultPlans();
    
    // Sync all plans with Stripe (creates products/prices for plans that don't have them)
    const syncResult = await PlansService.syncAllPlansWithStripe();
    if (syncResult.synced.length > 0) {
      console.log(`Synced ${syncResult.synced.length} plans with Stripe: ${syncResult.synced.join(', ')}`);
    }
    if (syncResult.failed.length > 0) {
      console.warn(`Failed to sync ${syncResult.failed.length} plans with Stripe`);
    }
    if (syncResult.skipped.length > 0) {
      console.log(`Skipped ${syncResult.skipped.length} plans (already synced): ${syncResult.skipped.join(', ')}`);
    }
  } catch (error) {
    console.error('Initialization error:', error);
  }
}

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
  await initialize();
});
