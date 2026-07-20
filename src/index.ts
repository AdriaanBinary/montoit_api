import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import autocompleteRoutes from './routes/autocomplete.js';
import registerRoutes from './routes/auth/register.js';
import loginRoutes from './routes/auth/login.js';
import MontoitDB from './db/pool.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'OK', message: 'Montoit API is running' });
});

//auth
app.use('/api/auth/', registerRoutes);
app.use('/api/auth/', loginRoutes);

const authCheck = (req: Request, res: Response, next: NextFunction) => {
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
    jwt.verify(token, secret);
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: error instanceof Error ? error.message : 'Invalid token'
    });
  }
};

app.use(authCheck);

// Routes
app.use('/api', autocompleteRoutes);

app.get('/api/db-test', async (_req: Request, res: Response) => {
  try {
    const result = await MontoitDB.query('SELECT NOW()');
    res.json({
      success: true,
      message: 'Database connection successful',
      timestamp: result.rows[0].now
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
