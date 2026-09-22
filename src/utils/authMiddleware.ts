import { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../db/prisma.js';

export interface AuthenticatedUserPayload {
  user_id?: string;
  email?: string;
  [key: string]: unknown;
}

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUserPayload;
};

export const checkAuth: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Missing or invalid authorization header'
    });
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_KEY;

  if (!secret) {
    return res.status(500).json({
      success: false,
      error: 'Server error',
      message: 'JWT secret is not configured'
    });
  }

  try {
    const decoded = jwt.verify(token, secret) as AuthenticatedUserPayload;
    (req as AuthenticatedRequest).user = decoded;
    next();
  } catch (error: unknown) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: error instanceof Error ? error.message : 'Invalid token'
    });
  }
};

export const requireAdmin: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, suspended_at: true }
    });

    if (!user || user.suspended_at || user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    return next();
  } catch (error: unknown) {
    return res.status(500).json({
      success: false,
      error: 'Authorization check failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
