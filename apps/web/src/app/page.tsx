'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth';
import { LoginButton, LogoutButton, UserProfile } from '@/components/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, type HealthResponse } from '@/lib/api-client';
import { CheckCircle, XCircle, Loader2, Shield, User, Database } from 'lucide-react';

type ApiStatus = 'idle' | 'loading' | 'success' | 'error';

export default function HomePage() {
  const { user, isAuthenticated, isLoading: authLoading, error: authError } = useAuth();
  const [apiStatus, setApiStatus] = useState<ApiStatus>('idle');
  const [apiResponse, setApiResponse] = useState<HealthResponse | null>(null);
  const [dbStatus, setDbStatus] = useState<ApiStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    checkApiStatus();
    checkDbStatus();
  }, []);

  const checkApiStatus = async () => {
    setApiStatus('loading');
    setErrorMessage(null);

    try {
      const data = await api.health();
      setApiResponse(data);
      setApiStatus('success');
    } catch (err) {
      setApiStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'API connection failed');
      console.error('API connection failed:', err);
    }
  };

  const checkDbStatus = async () => {
    setDbStatus('loading');

    try {
      await api.dbHealth();
      setDbStatus('success');
    } catch (err) {
      setDbStatus('error');
      console.error('Database connection failed:', err);
    }
  };

  const getStatusIcon = (status: ApiStatus) => {
    switch (status) {
      case 'loading':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <div className="h-4 w-4 rounded-full bg-gray-400" />;
    }
  };

  const getStatusColor = (status: ApiStatus) => {
    switch (status) {
      case 'loading':
        return 'text-blue-500';
      case 'success':
        return 'text-green-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="mb-8 text-center">
        <h1 className="mb-4 text-4xl font-bold">Treksistem</h1>
        <p className="text-lg text-muted-foreground">
          Modern CMS for Logistics Management
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Authentication Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Authentication</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {authLoading ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading...</span>
                </div>
              ) : isAuthenticated && user ? (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">Authenticated</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {user.roles.map((role, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {role.role.replace('_', ' ').toLowerCase()}
                      </Badge>
                    ))}
                  </div>
                  <LogoutButton size="sm" className="w-full mt-2" />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <XCircle className="h-4 w-4 text-gray-400" />
                    <span className="text-sm">Not authenticated</span>
                  </div>
                  {authError && (
                    <p className="text-xs text-red-500">{authError}</p>
                  )}
                  <LoginButton size="sm" className="w-full" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* API Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Status</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Backend API</span>
                <div className="flex items-center space-x-2">
                  {getStatusIcon(apiStatus)}
                  <span className={`text-sm font-medium ${getStatusColor(apiStatus)}`}>
                    {apiStatus.charAt(0).toUpperCase() + apiStatus.slice(1)}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Database</span>
                <div className="flex items-center space-x-2">
                  {getStatusIcon(dbStatus)}
                  <span className={`text-sm font-medium ${getStatusColor(dbStatus)}`}>
                    {dbStatus.charAt(0).toUpperCase() + dbStatus.slice(1)}
                  </span>
                </div>
              </div>

              {apiResponse && (
                <div className="text-xs text-muted-foreground">
                  Version: {apiResponse.version}
                </div>
              )}

              <Button 
                size="sm" 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  checkApiStatus();
                  checkDbStatus();
                }}
                disabled={apiStatus === 'loading' || dbStatus === 'loading'}
              >
                {(apiStatus === 'loading' || dbStatus === 'loading') ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  'Refresh Status'
                )}
              </Button>

              {errorMessage && (
                <p className="text-xs text-red-500 mt-2">{errorMessage}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* User Profile */}
        {isAuthenticated && user && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">User Profile</CardTitle>
              <User className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-0">
              <UserProfile showRoles={true} showDetails={true} className="border-0 shadow-none" />
            </CardContent>
          </Card>
        )}
      </div>

      {/* System Information */}
      {apiResponse && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">System Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="font-medium mb-2">API Response</h3>
                <pre className="text-xs bg-muted p-3 rounded-md overflow-auto">
                  <code>{JSON.stringify(apiResponse, null, 2)}</code>
                </pre>
              </div>
              <div>
                <h3 className="font-medium mb-2">Security Features</h3>
                <ul className="text-sm space-y-1">
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span>Device Fingerprinting</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span>Secure Token Storage</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span>CSRF Protection</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span>Rate Limiting</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span>JWT Revocation</span>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
