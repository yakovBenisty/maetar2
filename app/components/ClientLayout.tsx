'use client';

import { useState } from 'react';
import { SessionProvider } from 'next-auth/react';
import Sidebar from './Sidebar';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <SessionProvider>
    <div className="flex min-h-screen">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content area - shifted left to make room for sidebar */}
      <main className="flex-1 lg:mr-56 min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between p-4 bg-white border-b border-[#d1d9e0] sticky top-0 z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-[#636c76] hover:text-[#1f2328] p-2 rounded-lg hover:bg-[#f0f3f6] transition-colors"
          >
            ☰
          </button>
          <h1 className="text-sm font-bold text-[#0969da]">מערכת פקודות תשלום</h1>
          <div className="w-10" />
        </header>

        <div className="p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
    </SessionProvider>
  );
}
