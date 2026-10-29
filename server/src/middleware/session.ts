import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';

const COOKIE_NAME = 'uid';
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

declare module 'express-serve-static-core' {
  interface Request {
    userId: string;
  }
}

// Anonymous sessions: the first visit creates a user row and stores its id in a
// long-lived httpOnly cookie. There is no login; the cookie is the identity.
// The same shape works if real authentication is added later.
export async function session(req: Request, res: Response, next: NextFunction) {
  try {
    const cookieId = z.uuid().safeParse(req.cookies[COOKIE_NAME]);

    if (cookieId.success) {
      const existing = await db.query.users.findFirst({ where: eq(users.id, cookieId.data) });
      if (existing) {
        req.userId = existing.id;
        return next();
      }
    }

    const [created] = await db.insert(users).values({}).returning({ id: users.id });
    if (!created) throw new Error('Failed to create user');

    res.cookie(COOKIE_NAME, created.id, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: ONE_YEAR_MS,
    });
    req.userId = created.id;
    next();
  } catch (error) {
    next(error);
  }
}
