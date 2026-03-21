'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { href: '/', label: 'דשבורד', icon: '📊' },
  { href: '/upload', label: 'העלאת קבצים', icon: '📁' },
  { href: '/prepare', label: 'הכנת פקודה', icon: '⚙️' },
  { href: '/runs', label: 'היסטוריית ריצות', icon: '📋' },
  { href: '/reports', label: 'דוחות', icon: '📈' },
  { href: '/noseme', label: 'נושאים', icon: '🏷️' },
  { href: '/mosdot', label: 'מוסדות', icon: '🏫' },
  { href: '/users', label: 'משתמשים', icon: '👥', adminOnly: true },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DbStatus {
  connected: boolean;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);

  const isAdmin = session?.user?.role === 'admin';
  const displayName =
    session?.user?.firstName
      ? `${session.user.firstName} ${session.user.lastName ?? ''}`.trim()
      : session?.user?.name ?? session?.user?.email ?? '';

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then((r) => r.json())
      .then((data) => setDbStatus({ connected: data.connected ?? false }))
      .catch(() => setDbStatus({ connected: false }));
  }, []);

  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 right-0 h-full w-56 bg-white border-l border-[#d1d9e0] z-40
          flex flex-col
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#d1d9e0]">
          <div>
            <h1 className="text-sm font-bold text-[#0969da]">מערכת פקודות</h1>
            <p className="text-xs text-[#636c76]">עיריית נתיבות</p>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-[#636c76] hover:text-[#1f2328] p-1 rounded"
          >
            ✕
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-2">
            {visibleItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
                      ${
                        isActive
                          ? 'bg-[#ddf4ff] text-[#0969da] border border-[#0969da]'
                          : 'text-[#636c76] hover:bg-[#f0f3f6] hover:text-[#1f2328]'
                      }
                    `}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer: user info + DB status + logout */}
        <div className="p-4 border-t border-[#d1d9e0] space-y-3">
          {/* DB Status */}
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                dbStatus === null
                  ? 'bg-[#9a6700]'
                  : dbStatus.connected
                  ? 'bg-[#1a7f37]'
                  : 'bg-[#cf222e]'
              }`}
            />
            <span className="text-[#636c76]">
              {dbStatus === null
                ? 'מתחבר...'
                : dbStatus.connected
                ? 'MongoDB מחובר'
                : 'MongoDB מנותק'}
            </span>
          </div>

          {/* User info */}
          {session?.user && (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#1f2328] truncate">{displayName}</p>
                <p className="text-xs text-[#8c959f] truncate">
                  {isAdmin ? 'מנהל מערכת' : 'משתמש'}
                </p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                title="התנתק"
                className="flex-shrink-0 text-xs text-[#636c76] hover:text-[#cf222e] p-1 rounded hover:bg-[#f0f3f6] transition-colors"
              >
                ↩
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
