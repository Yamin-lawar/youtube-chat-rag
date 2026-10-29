import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';

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
      const existing = await prisma.user.findUnique({ where: { id: cookieId.data } });
      if (existing) {
        req.userId = existing.id;
        return next();
      }
    }

    const created = await prisma.user.create({ data: {} });

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
