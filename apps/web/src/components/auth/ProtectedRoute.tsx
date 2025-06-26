'use client'

import { useAuth, useRoleAccess, useContextAccess } from '@/contexts/AuthContext'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Shield, Lock, Loader2, AlertTriangle } from 'lucide-react'
import LoginButton from './LoginButton'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: string
  requiredContext?: string
  fallback?: React.ReactNode
  loadingFallback?: React.ReactNode
  requireAuth?: boolean
}

export function ProtectedRoute({
  children,
  requiredRole,
  requiredContext,
  fallback,
  loadingFallback,
  requireAuth = true
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user, error, clearError } = useAuth()
  const hasRequiredRole = useRoleAccess(requiredRole || '')
  const hasRequiredContext = useContextAccess(requiredContext || '')

  // Show loading state
  if (isLoading) {
    return (
      loadingFallback || (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm text-gray-600">Loading...</p>
          </div>
        </div>
      )
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-4 text-center">
              <AlertTriangle className="h-12 w-12 text-red-500" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Authentication Error
                </h3>
                <p className="text-sm text-gray-600 mt-1">{error}</p>
              </div>
              <div className="flex space-x-2">
                <Button onClick={clearError} variant="outline" size="sm">
                  Dismiss
                </Button>
                <LoginButton size="sm">
                  Try Again
                </LoginButton>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Check authentication requirement
  if (requireAuth && !isAuthenticated) {
    return (
      fallback || (
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center space-y-4 text-center">
                <Lock className="h-12 w-12 text-blue-500" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Authentication Required
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Please sign in to access this page
                  </p>
                </div>
                <LoginButton>
                  Sign in with Google
                </LoginButton>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    )
  }

  // Check role requirement
  if (requiredRole && !hasRequiredRole) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-4 text-center">
              <Shield className="h-12 w-12 text-orange-500" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Insufficient Permissions
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  You need the <strong>{requiredRole.replace('_', ' ').toLowerCase()}</strong> role to access this page
                </p>
              </div>
              <div className="text-xs text-gray-500">
                Current roles: {user?.roles.map(r => r.role).join(', ') || 'None'}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Check context requirement
  if (requiredContext && !hasRequiredContext) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-4 text-center">
              <Shield className="h-12 w-12 text-orange-500" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Access Denied
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  You don't have access to this resource context
                </p>
              </div>
              <div className="text-xs text-gray-500">
                Required context: {requiredContext}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // All checks passed, render children
  return <>{children}</>
}

// Convenience components for common use cases
export function AdminRoute({ children, ...props }: Omit<ProtectedRouteProps, 'requiredRole'>) {
  return (
    <ProtectedRoute requiredRole="PARTNER_ADMIN" {...props}>
      {children}
    </ProtectedRoute>
  )
}

export function MasterAdminRoute({ children, ...props }: Omit<ProtectedRouteProps, 'requiredRole'>) {
  return (
    <ProtectedRoute requiredRole="MASTER_ADMIN" {...props}>
      {children}
    </ProtectedRoute>
  )
}

export function DriverRoute({ children, ...props }: Omit<ProtectedRouteProps, 'requiredRole'>) {
  return (
    <ProtectedRoute requiredRole="DRIVER" {...props}>
      {children}
    </ProtectedRoute>
  )
}

// Hook for conditional rendering based on permissions
export function usePermissions() {
  const { user, isAuthenticated } = useAuth()
  
  return {
    isAuthenticated,
    isMasterAdmin: useRoleAccess('MASTER_ADMIN'),
    isAdmin: useRoleAccess('PARTNER_ADMIN'),
    isDriver: useRoleAccess('DRIVER'),
    hasRole: (role: string) => useRoleAccess(role),
    hasContext: (contextId: string) => useContextAccess(contextId),
    user
  }
}

export default ProtectedRoute