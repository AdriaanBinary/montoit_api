import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import autocompleteRoutes from './routes/autocomplete.js';
import registerRoutes from './routes/auth/register.js';
import loginRoutes from './routes/auth/login.js';
import listingsRoutes from './routes/listings.js';
import agenciesRoutes from './routes/agencies.js';
import usersRoutes from './routes/users.js';
import docsRoutes from './routes/docs.js';
import prisma from './db/prisma.js';
import { registerApiRoute } from './docs/swagger.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const healthResponseSchema = z.object({
  status: z.string(),
  message: z.string()
});

const dbTestResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  timestamp: z.union([z.string(), z.date()])
});

const dbTestErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string()
});

registerApiRoute({
  method: 'get',
  path: '/health',
  summary: 'Health check',
  tags: ['Health'],
  responses: {
    200: { description: 'API is alive', schema: healthResponseSchema }
  }
});

registerApiRoute({
  method: 'get',
  path: '/api/db-test',
  summary: 'Database connectivity check',
  tags: ['Health'],
  responses: {
    200: { description: 'Database connection successful', schema: dbTestResponseSchema },
    500: { description: 'Database connection failed', schema: dbTestErrorSchema }
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'OK', message: 'Montoit API is running' });
});

//auth
app.use('/api/auth/', registerRoutes);
app.use('/api/auth/', loginRoutes);

// Routes
app.use('/api', autocompleteRoutes);
app.use('/api', listingsRoutes);
app.use('/api', usersRoutes);
app.use('/api', agenciesRoutes);
app.use('/', docsRoutes);

app.get('/api/db-test', async (_req: Request, res: Response) => {
  try {
    const result = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() AS now`;
    res.json({
      success: true,
      message: 'Database connection successful',
      timestamp: result[0]?.now
    });
  } catch (error: unknown) {
    console.error('Database test error:', error);
    res.status(500).json({
      success: false,
      error: 'Database connection failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    path: _req.path
  });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: err instanceof Error ? err.message : 'Unknown error'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Montoit API running on http://localhost:${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'DEV'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

process.on('SIGINT', () => {
  console.log('\n📍 Shutting down gracefully...');
  process.exit(0);
});
