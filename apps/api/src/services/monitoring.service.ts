import type { Context } from 'hono'
import type { createDb } from '@treksistem/db'
import { auditLogs } from '@treksistem/db'

// Metric types for performance monitoring
export interface PerformanceMetric {
  name: string
  value: number
  unit: 'ms' | 'count' | 'bytes' | 'percent'
  timestamp: number
  tags?: Record<string, string>
}

// Error tracking interface
export interface ErrorReport {
  message: string
  stack?: string
  context: {
    path: string
    method: string
    userAgent?: string
    ip?: string
    userId?: string
    timestamp: number
  }
  severity: 'low' | 'medium' | 'high' | 'critical'
  fingerprint?: string // For error deduplication
}

// Security event interface
export interface SecurityEvent {
  type: 'auth_success' | 'auth_failure' | 'token_revocation' | 'rate_limit_hit' | 'suspicious_activity'
  userId?: string
  email?: string
  ip?: string
  userAgent?: string
  details: Record<string, any>
  timestamp: number
  severity: 'info' | 'warning' | 'error' | 'critical'
}

// Health check status
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: number
  checks: {
    database: { status: 'ok' | 'error'; responseTime?: number; error?: string }
    jwt: { status: 'ok' | 'error'; error?: string }
    memory: { status: 'ok' | 'warning' | 'error'; usage?: number }
  }
}

// Monitoring service interface
export interface MonitoringService {
  // Performance metrics
  recordMetric(metric: PerformanceMetric): Promise<void>
  recordResponseTime(path: string, method: string, duration: number): Promise<void>
  recordRequestCount(path: string, method: string, status: number): Promise<void>
  
  // Error tracking
  reportError(error: ErrorReport): Promise<void>
  reportException(error: Error, context: Context, severity?: ErrorReport['severity']): Promise<void>
  
  // Security monitoring
  recordSecurityEvent(event: SecurityEvent): Promise<void>
  
  // Health monitoring
  getHealthStatus(): Promise<HealthStatus>
  
  // System metrics
  recordMemoryUsage(): Promise<void>
  recordDatabasePerformance(operation: string, duration: number): Promise<void>
}

// Production monitoring service implementation
export class ProductionMonitoringService implements MonitoringService {
  private metrics: PerformanceMetric[] = []
  private errors: ErrorReport[] = []
  private maxStoredItems = 1000 // Limit memory usage

  constructor(
    private db?: ReturnType<typeof createDb>,
    private config: {
      enableConsoleLogging?: boolean
      enableDatabaseLogging?: boolean
      metricsRetentionHours?: number
    } = {}
  ) {
    this.config = {
      enableConsoleLogging: true,
      enableDatabaseLogging: true,
      metricsRetentionHours: 24,
      ...config
    }
  }

  async recordMetric(metric: PerformanceMetric): Promise<void> {
    try {
      // Store in memory (limited)
      this.metrics.push(metric)
      if (this.metrics.length > this.maxStoredItems) {
        this.metrics = this.metrics.slice(-this.maxStoredItems)
      }

      // Log to console if enabled
      if (this.config.enableConsoleLogging) {
        console.log('Metric:', {
          name: metric.name,
          value: metric.value,
          unit: metric.unit,
          tags: metric.tags,
          timestamp: new Date(metric.timestamp).toISOString()
        })
      }

      // In a real production environment, you'd send this to:
      // - Cloudflare Analytics
      // - External monitoring service (DataDog, New Relic, etc.)
      // - Custom metrics endpoint
      
    } catch (error) {
      console.error('Failed to record metric:', error)
    }
  }

  async recordResponseTime(path: string, method: string, duration: number): Promise<void> {
    await this.recordMetric({
      name: 'response_time',
      value: duration,
      unit: 'ms',
      timestamp: Date.now(),
      tags: { path, method }
    })
  }

  async recordRequestCount(path: string, method: string, status: number): Promise<void> {
    await this.recordMetric({
      name: 'request_count',
      value: 1,
      unit: 'count',
      timestamp: Date.now(),
      tags: { path, method, status: status.toString() }
    })
  }

  async reportError(error: ErrorReport): Promise<void> {
    try {
      // Store in memory
      this.errors.push(error)
      if (this.errors.length > this.maxStoredItems) {
        this.errors = this.errors.slice(-this.maxStoredItems)
      }

      // Log to console
      if (this.config.enableConsoleLogging) {
        console.error('Error Report:', {
          message: error.message,
          severity: error.severity,
          path: error.context.path,
          method: error.context.method,
          userId: error.context.userId,
          timestamp: new Date(error.context.timestamp).toISOString()
        })
        
        if (error.stack) {
          console.error('Stack:', error.stack)
        }
      }

      // Store in database if enabled
      if (this.config.enableDatabaseLogging && this.db) {
        await this.db.insert(auditLogs).values({
          userId: error.context.userId ? parseInt(error.context.userId) : null,
          action: 'error_reported',
          ipAddress: error.context.ip,
          userAgent: error.context.userAgent,
          success: false,
          details: JSON.stringify({
            message: error.message,
            severity: error.severity,
            fingerprint: error.fingerprint,
            stack: error.stack
          }),
          timestamp: new Date(error.context.timestamp)
        }).catch(dbError => {
          console.error('Failed to log error to database:', dbError)
        })
      }

    } catch (err) {
      console.error('Failed to report error:', err)
    }
  }

  async reportException(
    error: Error, 
    context: Context, 
    severity: ErrorReport['severity'] = 'medium'
  ): Promise<void> {
    const errorReport: ErrorReport = {
      message: error.message,
      stack: error.stack,
      context: {
        path: context.req.path,
        method: context.req.method,
        userAgent: context.req.header('user-agent'),
        ip: context.req.header('CF-Connecting-IP') || 
            context.req.header('X-Forwarded-For') || 
            context.req.header('X-Real-IP'),
        timestamp: Date.now()
      },
      severity,
      fingerprint: this.generateErrorFingerprint(error, context)
    }

    await this.reportError(errorReport)
  }

  async recordSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      // Log to console
      if (this.config.enableConsoleLogging) {
        const logLevel = event.severity === 'critical' || event.severity === 'error' ? 'error' : 'warn'
        console[logLevel]('Security Event:', {
          type: event.type,
          severity: event.severity,
          userId: event.userId,
          email: event.email,
          ip: event.ip,
          timestamp: new Date(event.timestamp).toISOString(),
          details: event.details
        })
      }

      // Store in database
      if (this.config.enableDatabaseLogging && this.db) {
        await this.db.insert(auditLogs).values({
          userId: event.userId ? parseInt(event.userId) : null,
          email: event.email,
          action: `security_${event.type}`,
          ipAddress: event.ip,
          userAgent: event.userAgent,
          success: event.type.includes('success'),
          details: JSON.stringify({
            type: event.type,
            severity: event.severity,
            ...event.details
          }),
          timestamp: new Date(event.timestamp)
        }).catch(dbError => {
          console.error('Failed to log security event to database:', dbError)
        })
      }

      // Record as metric
      await this.recordMetric({
        name: 'security_event',
        value: 1,
        unit: 'count',
        timestamp: event.timestamp,
        tags: {
          type: event.type,
          severity: event.severity
        }
      })

    } catch (error) {
      console.error('Failed to record security event:', error)
    }
  }

  async getHealthStatus(): Promise<HealthStatus> {
    const checks: HealthStatus['checks'] = {
      database: { status: 'ok' },
      jwt: { status: 'ok' },
      memory: { status: 'ok' }
    }

    // Check database connectivity
    if (this.db) {
      try {
        const start = Date.now()
        await this.db.select().from(auditLogs).limit(1)
        const responseTime = Date.now() - start
        
        checks.database = { 
          status: responseTime < 1000 ? 'ok' : 'error',
          responseTime 
        }
      } catch (error) {
        checks.database = { 
          status: 'error',
          error: error.message 
        }
      }
    }

    // Check JWT functionality (simplified)
    try {
      // This would test JWT signing/verification in a real implementation
      checks.jwt = { status: 'ok' }
    } catch (error) {
      checks.jwt = { 
        status: 'error',
        error: error.message 
      }
    }

    // Check memory usage (simplified for Cloudflare Workers)
    try {
      const memoryUsage = this.getMemoryUsageEstimate()
      checks.memory = {
        status: memoryUsage > 0.8 ? 'error' : memoryUsage > 0.6 ? 'warning' : 'ok',
        usage: memoryUsage
      }
    } catch (error) {
      checks.memory = { status: 'error' }
    }

    // Determine overall status
    const hasError = Object.values(checks).some(check => check.status === 'error')
    const hasWarning = Object.values(checks).some(check => check.status === 'warning')
    
    const status: HealthStatus['status'] = hasError ? 'unhealthy' : hasWarning ? 'degraded' : 'healthy'

    return {
      status,
      timestamp: Date.now(),
      checks
    }
  }

  async recordMemoryUsage(): Promise<void> {
    try {
      const usage = this.getMemoryUsageEstimate()
      await this.recordMetric({
        name: 'memory_usage',
        value: usage,
        unit: 'percent',
        timestamp: Date.now()
      })
    } catch (error) {
      console.error('Failed to record memory usage:', error)
    }
  }

  async recordDatabasePerformance(operation: string, duration: number): Promise<void> {
    await this.recordMetric({
      name: 'database_operation_time',
      value: duration,
      unit: 'ms',
      timestamp: Date.now(),
      tags: { operation }
    })
  }

  // Helper methods
  private generateErrorFingerprint(error: Error, context: Context): string {
    // Create a fingerprint for error deduplication
    const components = [
      error.message,
      error.stack?.split('\n')[0] || '',
      context.req.path,
      context.req.method
    ]
    
    return btoa(components.join('|')).slice(0, 32)
  }

  private getMemoryUsageEstimate(): number {
    // Simplified memory usage estimation for Cloudflare Workers
    // In a real implementation, you'd use process.memoryUsage() or similar
    const itemCount = this.metrics.length + this.errors.length
    const estimatedUsage = itemCount / this.maxStoredItems
    return Math.min(estimatedUsage, 1)
  }

  // Cleanup methods
  async cleanup(): Promise<void> {
    try {
      const cutoff = Date.now() - (this.config.metricsRetentionHours! * 60 * 60 * 1000)
      
      // Clean old metrics
      this.metrics = this.metrics.filter(metric => metric.timestamp > cutoff)
      
      // Clean old errors
      this.errors = this.errors.filter(error => error.context.timestamp > cutoff)
      
    } catch (error) {
      console.error('Failed to cleanup monitoring data:', error)
    }
  }

  // Query methods for debugging
  getRecentMetrics(name?: string, limit: number = 100): PerformanceMetric[] {
    let filtered = this.metrics
    
    if (name) {
      filtered = filtered.filter(metric => metric.name === name)
    }
    
    return filtered
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  }

  getRecentErrors(severity?: ErrorReport['severity'], limit: number = 100): ErrorReport[] {
    let filtered = this.errors
    
    if (severity) {
      filtered = filtered.filter(error => error.severity === severity)
    }
    
    return filtered
      .sort((a, b) => b.context.timestamp - a.context.timestamp)
      .slice(0, limit)
  }
}

// Factory function to create monitoring service
export function createMonitoringService(
  db?: ReturnType<typeof createDb>,
  config?: {
    enableConsoleLogging?: boolean
    enableDatabaseLogging?: boolean
    metricsRetentionHours?: number
  }
): MonitoringService {
  return new ProductionMonitoringService(db, config)
}

// Performance monitoring middleware
export function createPerformanceMiddleware(
  monitoring: MonitoringService
) {
  return async (c: Context, next: () => Promise<void>) => {
    const start = Date.now()
    
    try {
      await next()
      
      const duration = Date.now() - start
      const status = c.res.status
      
      // Record metrics
      await monitoring.recordResponseTime(c.req.path, c.req.method, duration)
      await monitoring.recordRequestCount(c.req.path, c.req.method, status)
      
    } catch (error) {
      const duration = Date.now() - start
      
      // Record error metrics
      await monitoring.recordResponseTime(c.req.path, c.req.method, duration)
      await monitoring.recordRequestCount(c.req.path, c.req.method, 500)
      
      // Report the exception
      await monitoring.reportException(error as Error, c)
      
      throw error
    }
  }
}