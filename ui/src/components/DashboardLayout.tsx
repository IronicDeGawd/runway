import { ReactNode } from 'react';
import { Navbar } from './Navbar';
import { SecurityBanner } from './SecurityBanner';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-surface overflow-hidden">
      <div className="relative">
        <SecurityBanner />
        <Navbar />
        {/* Halo glow effect */}
        <div 
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-32 pointer-events-none z-0 bg-halo-glow blur-[40px]"
        />
        
        {/* Animated Blobs */}
        <div className="absolute top-20 left-20 w-64 h-64 bg-neon/10 rounded-full blur-3xl animate-blob pointer-events-none" />
        <div className="absolute bottom-20 right-20 w-80 h-80 bg-neon/5 rounded-full blur-3xl animate-blob animation-delay-2000 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-neon/5 rounded-full blur-3xl animate-blob animation-delay-4000 pointer-events-none" />
        
        <main className="pb-8 relative">
          {children}
        </main>
      </div>
    </div>
  );
}
