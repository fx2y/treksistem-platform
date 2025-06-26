import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthWrapper, AuthErrorBoundary } from '@/components/auth';
import { SecurityInitializer } from '@/components/SecurityInitializer';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  title: {
    default: 'Treksistem',
    template: '%s | Treksistem',
  },
  description: 'Modern CMS for Logistics Management',
  keywords: ['logistics', 'cms', 'management', 'tracking'],
  authors: [{ name: 'Treksistem Team' }],
  creator: 'Treksistem',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
  ),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Treksistem',
    title: 'Treksistem - Modern CMS for Logistics',
    description: 'Modern CMS for Logistics Management',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta httpEquiv="X-Frame-Options" content="DENY" />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <SecurityInitializer />
        <AuthErrorBoundary>
          <AuthWrapper googleClientId={googleClientId}>
            <main className="min-h-screen bg-background text-foreground antialiased">
              {children}
            </main>
          </AuthWrapper>
        </AuthErrorBoundary>
      </body>
    </html>
  );
}
