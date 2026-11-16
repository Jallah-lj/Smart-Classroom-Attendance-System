import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/index.js';
import { getDb } from './db/index.js';
import { authRouter } from './routes/auth.js';
import { sessionsRouter } from './routes/sessions.js';
import { attendanceRouter } from './routes/attendance.js';
import { adminRouter } from './routes/admin.js';

export const app = express();

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS configuration (allow all local preview hosts and web client)
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or server-to-server)
    if (!origin) return callback(null, true);
    // Allow any localhost, 127.0.0.1, or e2b preview domain
    if (
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.includes('.e2b.app')
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));

// Body parser with 10MB limit for live camera base64 JPEG captures
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health and root metadata
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    institution: config.institution.name,
    environment: config.nodeEnv,
    version: '1.0.0'
  });
});

// API Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/sessions', sessionsRouter);
app.use('/api/v1/attendance', attendanceRouter);
app.use('/api/v1/admin', adminRouter);

// Global 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found.` });
});

// Global error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[ServerError]', err);
  res.status(err.statusCode || 500).json({
    error: err.code || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected error occurred.'
  });
});

// Start server if run directly
if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  getDb().then(() => {
    const server = app.listen(config.port, '0.0.0.0', () => {
      console.log(`[Server] Smart Classroom Attendance API listening on http://0.0.0.0:${config.port}`);
    });

    const shutdown = () => {
      console.log('[Server] Gracefully shutting down...');
      server.close(() => {
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }).catch((err) => {
    console.error('[Server] Fatal startup error:', err);
    process.exit(1);
  });
}
