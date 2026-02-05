import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { BETTER_AUTH_SECRET, BETTER_AUTH_URL, FRONTEND_URL } from '../config/env.js';

const scryptAsync = promisify(scrypt);

// Custom password hashing compatible with our admin service
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

async function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  const [salt, storedKey] = data.hash.split(':');
  if (!salt || !storedKey) return false;

  const normalizedPassword = data.password.normalize('NFKC');
  const derivedKey = (await scryptAsync(normalizedPassword, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  })) as Buffer;

  const storedKeyBuffer = Buffer.from(storedKey, 'hex');
  return timingSafeEqual(derivedKey, storedKeyBuffer);
}

export const auth = betterAuth({
  secret: BETTER_AUTH_SECRET,
  baseURL: BETTER_AUTH_URL,
  basePath: '/api/auth',
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },
  advanced: {
    generateId: () => crypto.randomUUID(),
  },
  trustedOrigins: [FRONTEND_URL],
});

export type AuthSession = typeof auth.$Infer.Session;
