import { Request, Response, NextFunction } from 'express';
import { auth } from '../lib/auth.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name?: string;
    role?: string;
  };
  session?: unknown;
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : req.cookies?.['better-auth.session_token'];

    if (!token) {
      res.status(401).json({ error: 'Unauthorized - No token provided' });
      return;
    }

    // Verify session using Better Auth
    const session = await auth.api.getSession({
      headers: {
        ...req.headers,
        cookie: `better-auth.session_token=${token}`,
      } as unknown as Headers,
    });

    if (!session || !session.user) {
      res.status(401).json({ error: 'Unauthorized - Invalid token' });
      return;
    }

    // Get user with role from database
    const dbUser = await db.query.users.findFirst({
      where: eq(schema.users.id, session.user.id),
    });

    req.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name || undefined,
      role: dbUser?.role || 'user',
    };
    req.session = session.session;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Unauthorized - Authentication failed' });
  }
}

export function optionalAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  requireAuth(req, res, next).catch(() => next());
}
