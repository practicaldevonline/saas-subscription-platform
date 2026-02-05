import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

export async function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Get user with role
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, req.user.id),
    });

    if (!user || user.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden - Admin access required' });
      return;
    }

    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
