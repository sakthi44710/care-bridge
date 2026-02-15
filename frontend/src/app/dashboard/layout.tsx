'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore, useUIStore } from '@/lib/store';
import { signOutUser } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard, FileText, MessageSquare, Heart,
  Shield, LogOut, Menu, X, Sun, Moon, User,
  Users, Stethoscope, ClipboardList,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/documents', label: 'Documents', icon: FileText },
  { href: '/dashboard/chat', label: 'AI Chat', icon: MessageSquare },
  { href: '/dashboard/health', label: 'Health Records', icon: Heart },
  { href: '/dashboard/blockchain', label: 'Blockchain', icon: Shield },
];

const doctorNavItems = [
  { href: '/dashboard/patients', label: 'My Patients', icon: Users },
  { href: '/dashboard/consultations', label: 'Consultations', icon: ClipboardList },
];

const patientNavItems = [
  { href: '/dashboard/my-doctors', label: 'My Doctors', icon: Stethoscope },
  { href: '/dashboard/consultations', label: 'Consultations', icon: ClipboardList },
];

const adminNavItems = [
  { href: '/dashboard/admin', label: 'Admin Panel', icon: Shield },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, user, userData, logout } = useAuthStore();
  const { sidebarOpen, toggleSidebar, theme, toggleTheme } = useUIStore();
  const router = useRouter();
  const pathname = usePathname();
  
  const isAdmin = userData?.role === 'admin';
  const isDoctor = userData?.role === 'doctor' || userData?.role === 'clinician';
  const isPatient = userData?.role === 'patient';
  
  const allNavItems = [
    ...navItems,
    ...(isDoctor ? doctorNavItems : []),
    ...(isPatient ? patientNavItems : []),
    ...(isAdmin ? adminNavItems : []),
  ];

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform duration-200 lg:translate-x-0 lg:static ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">CB</span>
              </div>
              <span className="font-bold text-lg">CareBridge</span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={toggleSidebar}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            {allNavItems.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => {
                    if (window.innerWidth < 1024) toggleSidebar();
                  }}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t space-y-2">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user?.displayName || 'User'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email || ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={toggleTheme}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 text-red-500 hover:text-red-600"
                onClick={async () => {
                  await signOutUser();
                  logout();
                  router.push('/login');
                }}
              >
                <LogOut className="h-4 w-4 mr-1" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-0">
        <header className="sticky top-0 z-30 bg-background border-b px-4 py-3 lg:hidden">
          <Button variant="ghost" size="icon" onClick={toggleSidebar}>
            <Menu className="h-5 w-5" />
          </Button>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
