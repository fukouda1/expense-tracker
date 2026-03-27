import { Request, Response, NextFunction } from 'express';

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<any>;

/** Wraps an async route handler so unhandled promise rejections are forwarded to Express error middleware. */
export const asyncHandler = (fn: AsyncRouteHandler) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/** Round a number to 2 decimal places to avoid floating-point artifacts. */
export const round2 = (n: number): number => Math.round(n * 100) / 100;
