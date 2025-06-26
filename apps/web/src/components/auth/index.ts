// Authentication Components
export { default as LoginButton } from './LoginButton'
export { default as LogoutButton } from './LogoutButton'
export { default as UserProfile, UserProfileCompact } from './UserProfile'
export { 
  default as ProtectedRoute, 
  AdminRoute, 
  MasterAdminRoute, 
  DriverRoute,
  usePermissions 
} from './ProtectedRoute'
export { default as AuthErrorBoundary, useAuthErrorHandler } from './AuthErrorBoundary'

// Re-export context and hooks for convenience
export { 
  AuthWrapper, 
  AuthProvider, 
  useAuth, 
  withAuth, 
  useRoleAccess, 
  useContextAccess 
} from '@/contexts/AuthContext'

// Types
export type { User, AuthState } from '@/contexts/AuthContext'