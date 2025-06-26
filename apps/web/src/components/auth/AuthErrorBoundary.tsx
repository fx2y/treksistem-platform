'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error?: Error
}

export class AuthErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Auth Error Boundary caught an error:', error, errorInfo)
    
    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI
      return (
        <div className="flex items-center justify-center min-h-[400px] p-4">
          <Card className="w-full max-w-lg">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center space-y-4 text-center">
                <AlertTriangle className="h-16 w-16 text-red-500" />
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">
                    Authentication Error
                  </h2>
                  <p className="text-sm text-gray-600 mb-4">
                    An unexpected error occurred with the authentication system.
                  </p>
                  {this.state.error && (
                    <details className="text-xs text-gray-500 mb-4">
                      <summary className="cursor-pointer hover:text-gray-700">
                        Error Details
                      </summary>
                      <pre className="mt-2 p-2 bg-gray-50 rounded text-left overflow-auto">
                        {this.state.error.message}
                      </pre>
                    </details>
                  )}
                </div>
                <div className="flex space-x-3">
                  <Button
                    onClick={this.handleRetry}
                    variant="outline"
                    size="sm"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Try Again
                  </Button>
                  <Button
                    onClick={this.handleReload}
                    size="sm"
                  >
                    Reload Page
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}

// Hook version for functional components
export function useAuthErrorHandler() {
  const handleAuthError = (error: Error) => {
    console.error('Authentication error:', error)
    
    // You could send this to your error tracking service
    // Example: sendToErrorTracking(error)
    
    // Clear potentially corrupt auth state
    try {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_token_expiry')
    } catch (e) {
      console.warn('Failed to clear auth storage:', e)
    }
  }

  return { handleAuthError }
}

export default AuthErrorBoundary