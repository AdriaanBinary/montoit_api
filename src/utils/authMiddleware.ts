import { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';

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
