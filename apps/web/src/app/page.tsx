'use client';

import { useEffect, useState } from 'react';

type PingStatus = 'idle' | 'loading' | 'success' | 'error';
type PingResponse = { pong: boolean };

export default function HomePage() {
  const [status, setStatus] = useState<PingStatus>('idle');
  const [apiResponse, setApiResponse] = useState<PingResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const checkApiStatus = async () => {
      setStatus('loading');
      setErrorMessage(null);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      if (!apiUrl) {
        setStatus('error');
        setErrorMessage(
          'API URL is not configured. Please set NEXT_PUBLIC_API_URL.'
        );
        return;
      }

      try {
        const response = await fetch(`${apiUrl}/api/v1/ping`);
        if (!response.ok) {
          throw new Error(`API returned status: ${response.status}`);
        }
        const data = (await response.json()) as PingResponse;
        setApiResponse(data);
        setStatus('success');
      } catch (err) {
        setStatus('error');
        setErrorMessage(
          err instanceof Error ? err.message : 'An unknown error occurred.'
        );
        console.error('API connection failed:', err);
      }
    };

    void checkApiStatus();
  }, []);

  const getStatusColor = () => {
    switch (status) {
      case 'loading':
        return 'text-blue-400';
      case 'success':
        return 'text-green-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="container mx-auto flex h-screen flex-col items-center justify-center p-4">
      <h1 className="mb-4 text-4xl font-bold">Treksistem</h1>
      <p className="mb-8 text-lg text-muted-foreground">
        Frontend Web Application
      </p>
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-md">
        <h2 className="mb-4 text-2xl font-semibold">API Connectivity Test</h2>
        <div className="flex items-center justify-between">
          <span className="text-lg">Backend Status:</span>
          <span className={`text-lg font-bold ${getStatusColor()}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>
        {status === 'success' && apiResponse && (
          <pre className="mt-4 rounded-md bg-muted p-4 text-sm">
            <code>{JSON.stringify(apiResponse, null, 2)}</code>
          </pre>
        )}
        {status === 'error' && errorMessage && (
          <p className="mt-4 text-sm text-red-400">
            <strong>Error:</strong> {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}
