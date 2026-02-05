import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import type { Setting, NewSetting } from '../db/schema.js';

const scryptAsync = promisify(scrypt);

// Default admin credentials
const DEFAULT_ADMIN_EMAIL = 'admin@example.com';
const DEFAULT_ADMIN_PASSWORD = 'admin123';
const DEFAULT_ADMIN_NAME = 'Admin User';

// Better Auth compatible password hashing (uses scrypt)
// Using standard scrypt parameters that Better Auth uses
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const normalizedPassword = password.normalize('NFKC');
  const derivedKey = (await scryptAsync(normalizedPassword, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  })) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(hash: string, password: string): Promise<boolean> {
  const [salt, storedKey] = hash.split(':');
  if (!salt || !storedKey) return false;

  const normalizedPassword = password.normalize('NFKC');
  const derivedKey = (await scryptAsync(normalizedPassword, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  })) as Buffer;

  const storedKeyBuffer = Buffer.from(storedKey, 'hex');
  return timingSafeEqual(derivedKey, storedKeyBuffer);
}

export class AdminService {
  /**
   * Seed default admin user if none exists
   */
  static async seedDefaultAdmin(): Promise<void> {
    // Check if any admin exists
    const existingAdmin = await db.query.users.findFirst({
      where: eq(schema.users.role, 'admin'),
    });

    if (existingAdmin) {
      console.log('Admin user already exists');
      return;
    }

    // Check if user with admin email already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(schema.users.email, DEFAULT_ADMIN_EMAIL),
    });

    if (existingUser) {
      // Promote existing user to admin
      await db
        .update(schema.users)
        .set({ role: 'admin' })
        .where(eq(schema.users.id, existingUser.id));
      console.log(`Promoted ${DEFAULT_ADMIN_EMAIL} to admin`);
      return;
    }

    // Create new admin user with Better Auth compatible password hash
    const hashedPassword = await hashPassword(DEFAULT_ADMIN_PASSWORD);
    const userId = crypto.randomUUID();
    const now = new Date();

    await db.insert(schema.users).values({
      id: userId,
      email: DEFAULT_ADMIN_EMAIL,
      name: DEFAULT_ADMIN_NAME,
      role: 'admin',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    // Create account with password
    await db.insert(schema.accounts).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId: userId,
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
    });

    console.log('='.repeat(50));
    console.log('Default admin user created:');
    console.log(`  Email: ${DEFAULT_ADMIN_EMAIL}`);
    console.log(`  Password: ${DEFAULT_ADMIN_PASSWORD}`);
    console.log('  Please change the password after first login!');
    console.log('='.repeat(50));
  }

  /**
   * Create a new admin user
   */
  static async createAdminUser(
    name: string,
    email: string,
    password: string
  ): Promise<{ success: boolean; userId?: string; error?: string }> {
    // Check if email already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });

    if (existingUser) {
      return { success: false, error: 'A user with this email already exists' };
    }

    // Use Better Auth compatible password hash
    const hashedPassword = await hashPassword(password);
    const userId = crypto.randomUUID();
    const now = new Date();

    // Create user with admin role
    await db.insert(schema.users).values({
      id: userId,
      email,
      name,
      role: 'admin',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    // Create account with password
    await db.insert(schema.accounts).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId: userId,
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true, userId };
  }

  /**
   * Delete a user and all related data
   */
  static async deleteUser(userId: string): Promise<boolean> {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });

    if (!user) return false;

    // Delete related data (cascade should handle this, but being explicit)
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
    await db.delete(schema.accounts).where(eq(schema.accounts.userId, userId));
    await db.delete(schema.subscriptions).where(eq(schema.subscriptions.userId, userId));
    await db.delete(schema.invoices).where(eq(schema.invoices.userId, userId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));

    return true;
  }

  /**
   * Get all settings
   */
  static async getAllSettings(): Promise<Setting[]> {
    return await db.query.settings.findMany();
  }

  /**
   * Get public settings only
   */
  static async getPublicSettings(): Promise<Setting[]> {
    return await db.query.settings.findMany({
      where: eq(schema.settings.isPublic, true),
    });
  }

  /**
   * Get a setting by key
   */
  static async getSetting(key: string): Promise<Setting | undefined> {
    return await db.query.settings.findFirst({
      where: eq(schema.settings.key, key),
    });
  }

  /**
   * Set a setting value
   */
  static async setSetting(
    key: string,
    value: string,
    description?: string,
    isPublic?: boolean
  ): Promise<Setting> {
    const existing = await this.getSetting(key);

    if (existing) {
      await db
        .update(schema.settings)
        .set({
          value,
          description: description ?? existing.description,
          isPublic: isPublic ?? existing.isPublic,
          updatedAt: new Date(),
        })
        .where(eq(schema.settings.id, existing.id));
      return (await this.getSetting(key))!;
    }

    const newSetting: NewSetting = {
      id: crypto.randomUUID(),
      key,
      value,
      description: description || null,
      isPublic: isPublic || false,
      updatedAt: new Date(),
    };

    await db.insert(schema.settings).values(newSetting);
    return (await this.getSetting(key))!;
  }

  /**
   * Delete a setting
   */
  static async deleteSetting(key: string): Promise<boolean> {
    const existing = await this.getSetting(key);
    if (!existing) return false;

    await db.delete(schema.settings).where(eq(schema.settings.id, existing.id));
    return true;
  }

  /**
   * Get dashboard stats
   */
  static async getDashboardStats() {
    const users = await db.query.users.findMany();
    const subscriptions = await db.query.subscriptions.findMany();
    const plans = await db.query.plans.findMany();
    const invoices = await db.query.invoices.findMany();

    const activeSubscriptions = subscriptions.filter((s) => s.status === 'active');
    const totalRevenue = invoices.reduce((sum, inv) => sum + inv.amountPaid, 0);

    return {
      totalUsers: users.length,
      totalSubscriptions: subscriptions.length,
      activeSubscriptions: activeSubscriptions.length,
      totalPlans: plans.length,
      activePlans: plans.filter((p) => p.isActive).length,
      totalRevenue: totalRevenue / 100, // Convert from cents
      recentInvoices: invoices.slice(0, 5),
    };
  }

  /**
   * Get all users with their subscription info
   */
  static async getAllUsers() {
    const users = await db.query.users.findMany();
    const subscriptions = await db.query.subscriptions.findMany();

    return users.map((user) => {
      const subscription = subscriptions.find((s) => s.userId === user.id);
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        subscription: subscription
          ? {
              status: subscription.status,
              planId: subscription.planId,
              billingInterval: subscription.billingInterval,
            }
          : null,
      };
    });
  }

  /**
   * Update user role
   */
  static async updateUserRole(userId: string, role: 'user' | 'admin'): Promise<boolean> {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });

    if (!user) return false;

    await db
      .update(schema.users)
      .set({ role, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));

    return true;
  }
}
