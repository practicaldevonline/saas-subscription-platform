/**
 * Centralized environment configuration
 * This file loads dotenv and exports all environment variables.
 * Import this file FIRST in the application entry point (index.ts).
 */
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Server Configuration
 */
export const PORT = process.env.PORT || '3001';
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';

/**
 * Frontend URL (for CORS and redirects)
 */
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * Database Configuration
 */
export const DATABASE_PATH = process.env.DATABASE_PATH || './data/database.db';

/**
 * Better Auth Configuration
 */
export const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET;
export const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || 'http://localhost:3001';

/**
 * Stripe Configuration
 */
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * Helper to check if Stripe is configured
 */
export const isStripeConfigured = (): boolean => {
  return !!STRIPE_SECRET_KEY;
};

/**
 * Export all config as a single object for convenience
 */
export const config = {
  // Server
  port: PORT,
  nodeEnv: NODE_ENV,
  isProduction: IS_PRODUCTION,

  // URLs
  frontendUrl: FRONTEND_URL,

  // Database
  databasePath: DATABASE_PATH,

  // Auth
  betterAuthSecret: BETTER_AUTH_SECRET,
  betterAuthUrl: BETTER_AUTH_URL,

  // Stripe
  stripeSecretKey: STRIPE_SECRET_KEY,
  stripeWebhookSecret: STRIPE_WEBHOOK_SECRET,
  isStripeConfigured,
} as const;

export default config;
