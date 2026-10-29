import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { session } from './middleware/session.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Everything below needs to know which anonymous user is calling.
  app.use('/api', session);

  app.get('/api/me', (req, res) => {
    res.json({ userId: req.userId });
  });

  // Last-resort error handler so unexpected failures return JSON, not a stack trace.
  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
