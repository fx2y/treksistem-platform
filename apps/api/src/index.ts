import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { HTTPException } from 'hono/http-exception';
import { createDb, type D1Database } from '@treksistem/db';
import { sql } from 'drizzle-orm';

// Import authentication and security components
import { createAuthRouter } from './routes/auth';
import { createMasterDataRouter } from './routes/master-data';
import { createSecurityMiddlewareStack } from './middleware/security';
import {
  createMonitoringService,
  createPerformanceMiddleware,
} from './services/monitoring.service';
import { createJWTService } from './services/jwt.service';
import {
  requireAuth,
  getCurrentUser,
  requireAdmin,
  requireMasterAdmin,
} from './middleware/jwt';

// Environment bindings interface
interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  CSRF_SECRET?: string;
  NODE_ENV?: string;
}

// Create main application
const app = new Hono<{ Bindings: Env }>();

// CORS configuration for frontend integration
app.use(
  '*',
  cors({
    origin: origin => {
      // Allow localhost for development
      if (origin?.includes('localhost') || origin?.includes('127.0.0.1')) {
        return origin;
      }
      // Allow your production domain
      if (origin?.includes('treksistem.com')) {
        return origin;
      }
      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Fingerprint',
      'X-CSRF-Token',
    ],
    exposeHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
    credentials: true,
    maxAge: 86400, // 24 hours
  })
);

// Development logging
app.use('*', logger());

// Pretty JSON formatting in development
app.use('*', prettyJSON());

// Initialize security middleware stack
app.use('*', async (c, next) => {
  const origins = [
    'http://localhost:3000',
    'https://treksistem.com',
    'https://*.treksistem.com',
  ];

  const securityStack = createSecurityMiddlewareStack({
    origins,
    csrfSecret: c.env.CSRF_SECRET,
    rateLimitConfig: {
      windowMs: 60 * 1000, // 1 minute
      max: 100, // 100 requests per minute
      authEndpointMax: 10, // 10 auth requests per minute
    },
    db: createDb(c.env.DB),
  });

  // Apply security middleware stack
  for (const middleware of securityStack) {
    await middleware(c, async () => {});
  }

  await next();
});

// Performance monitoring middleware
app.use('*', async (c, next) => {
  const db = createDb(c.env.DB);
  const monitoring = createMonitoringService(db);
  const performanceMiddleware = createPerformanceMiddleware(monitoring);

  await performanceMiddleware(c, next);
});

// Global error handler
app.onError((err, c) => {
  console.error('Global error handler:', err);

  if (err instanceof HTTPException) {
    // Return the specific error response
    return c.json(
      JSON.parse(err.message || '{"error": "unknown_error"}'),
      err.status
    );
  }

  // Generic server error
  return c.json(
    {
      error: 'internal_server_error',
      details: 'An unexpected error occurred',
    },
    500
  );
});

// API v1 router
const v1 = app.basePath('/api/v1');

// Public health endpoints (no authentication required)
v1.get('/ping', c => {
  return c.json({
    pong: true,
    timestamp: Date.now(),
    version: '1.0.0',
  });
});

v1.get('/db-health', async c => {
  try {
    const db = createDb(c.env.DB);
    const start = Date.now();

    const result = await db.run(
      sql`SELECT name FROM sqlite_master WHERE type='table';`
    );

    const responseTime = Date.now() - start;

    return c.json({
      success: true,
      tables: result.results,
      responseTime: `${responseTime}ms`,
      timestamp: Date.now(),
    });
  } catch (err) {
    return c.json(
      {
        success: false,
        error: 'Database connection failed',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      500
    );
  }
});

// Authentication routes (no JWT required for these endpoints)
v1.route('/auth', createAuthRouter());

// Master data routes (require authentication and proper RBAC)
v1.route('/master-data', createMasterDataRouter());

// Protected API endpoints (require authentication)
const protectedV1 = v1.basePath('/protected');

// Apply JWT middleware to all protected routes
protectedV1.use('*', requireAuth);

// Example protected endpoint
protectedV1.get('/profile', c => {
  const user = getCurrentUser(c);

  if (!user) {
    return c.json(
      {
        error: 'authentication_required',
        details: 'User session not found',
      },
      401
    );
  }

  return c.json({
    profile: {
      id: user.sub,
      email: user.email,
      name: user.name,
      picture: user.picture,
      roles: user.roles,
      emailVerified: user.email_verified,
      lastActivity: user.last_activity,
    },
  });
});

// Admin-only endpoints
const adminV1 = protectedV1.basePath('/admin');

// Apply admin role requirement to all admin routes
adminV1.use('*', requireAdmin);

adminV1.get('/users', c => {
  return c.json({
    message: 'Admin users endpoint - implement user management here',
    note: 'Requires MASTER_ADMIN or PARTNER_ADMIN role',
  });
});

// Master admin only endpoints
const masterAdminV1 = protectedV1.basePath('/system');

// Apply master admin role requirement to system endpoints
masterAdminV1.use('*', requireMasterAdmin);

// System monitoring endpoints (admin access required)
masterAdminV1.get('/health', async c => {
  try {
    const db = createDb(c.env.DB);
    const monitoring = createMonitoringService(db);

    const healthStatus = await monitoring.getHealthStatus();
    return c.json(healthStatus);
  } catch {
    return c.json(
      {
        status: 'unhealthy',
        error: 'Health check failed',
        timestamp: Date.now(),
      },
      500
    );
  }
});

masterAdminV1.get('/metrics', c => {
  try {
    // Get recent metrics - simplified for now
    const metricsResult: unknown[] = [];

    return c.json({
      metrics: metricsResult,
      timestamp: Date.now(),
    });
  } catch (error: unknown) {
    return c.json(
      {
        error: 'metrics_unavailable',
        details:
          error instanceof Error
            ? error.message
            : 'Unable to fetch system metrics',
      },
      500
    );
  }
});

// JWT token management endpoints
protectedV1.post('/auth/logout', async c => {
  const user = getCurrentUser(c);

  if (!user) {
    return c.json(
      {
        error: 'authentication_required',
      },
      401
    );
  }

  try {
    const db = createDb(c.env.DB);
    const jwtService = createJWTService(c.env.JWT_SECRET, db);
    const monitoring = createMonitoringService(db);

    // Revoke the current token
    await jwtService.revoke(user.jti, user.sub, 'user_logout');

    // Record security event
    await monitoring.recordSecurityEvent({
      type: 'auth_success',
      userId: user.sub,
      email: user.email,
      details: {
        action: 'logout',
        jti: user.jti,
      },
      timestamp: Date.now(),
      severity: 'info',
    });

    return c.json({ success: true });
  } catch (error: unknown) {
    return c.json(
      {
        error: 'logout_failed',
        details:
          error instanceof Error ? error.message : 'Failed to logout user',
      },
      500
    );
  }
});

// Cleanup task endpoint (for maintenance)
masterAdminV1.post('/cleanup', async c => {
  try {
    const db = createDb(c.env.DB);
    const jwtService = createJWTService(c.env.JWT_SECRET, db);

    // Run cleanup tasks
    await jwtService.cleanupExpiredRevocations();
    // Additional cleanup tasks can be added here

    return c.json({
      success: true,
      message: 'System cleanup completed',
    });
  } catch (error: unknown) {
    return c.json(
      {
        error: 'cleanup_failed',
        details:
          error instanceof Error ? error.message : 'System cleanup failed',
      },
      500
    );
  }
});

// 404 handler for API routes
v1.all('*', c => {
  return c.json(
    {
      error: 'not_found',
      details: 'API endpoint not found',
      path: c.req.path,
    },
    404
  );
});

// Root health check
app.get('/', c => {
  return c.json({
    service: 'Treksistem API',
    version: '1.0.0',
    status: 'running',
    timestamp: Date.now(),
    endpoints: {
      health: '/api/v1/ping',
      auth: '/api/v1/auth/*',
      masterData: '/api/v1/master-data/*',
      protected: '/api/v1/protected/*',
    },
  });
});

export default app;
