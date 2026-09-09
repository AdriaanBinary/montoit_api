import crypto from 'node:crypto';
import { NextFunction, Request, RequestHandler, Response } from 'express';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

type LogLevel = 'info' | 'warn' | 'error';
type LogFields = Record<string, unknown>;

function write(level: LogLevel, event: string, fields: LogFields = {}): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields
  };

  const output = JSON.stringify(entry);
  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  info(event: string, fields?: LogFields): void {
    write('info', event, fields);
  },
  warn(event: string, fields?: LogFields): void {
    write('warn', event, fields);
  },
  error(event: string, fields?: LogFields): void {
    write('error', event, fields);
  }
};

export const requestIdMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const suppliedRequestId = req.header('X-Request-ID');
  const requestId = suppliedRequestId?.trim() || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};

export function maskIdentifier(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.length <= 8) return `${value.slice(0, 2)}...`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function errorFields(error: unknown): LogFields {
  if (error instanceof Error) {
    return { error_name: error.name, error_message: error.message };
  }
  return { error_message: 'Unknown error' };
}
