import express from 'express';
import dotenv from 'dotenv';
import autocompleteRoutes from './routes/autocomplete.js';
import MontoitDB from './db/pool.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Montoit API is running' });
});

// Routes
app.use('/api', autocompleteRoutes);

// Database connection test endpoint
app.get('/api/db-test', async (req, res) => {
    try {
        const result = await MontoitDB.query('SELECT NOW()');
        res.json({
            success: true,
            message: 'Database connection successful',
            timestamp: result.rows[0].now
        });
    } catch (error) {
        console.error('Database test error:', error);
        res.status(500).json({
            success: false,
            error: 'Database connection failed',
            message: error.message
        });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Not Found',
        path: req.path
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: err.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Montoit API running on http://localhost:${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'DEV'}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`🔍 Autocomplete: http://localhost:${PORT}/api/autocomplete?q=test`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n📍 Shutting down gracefully...');
    process.exit(0);
});
