import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

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
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <main className="min-h-screen bg-background text-foreground antialiased">
          {children}
        </main>
      </body>
    </html>
  );
}
