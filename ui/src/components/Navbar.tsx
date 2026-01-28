import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, HelpCircle, Settings, User, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '../contexts/AuthContext';
import * as React from 'react';

const navItems = [
  { label: 'Overview', path: '/' },
  { label: 'Projects', path: '/projects' },
  { label: 'Deploy', path: '/deploy' },
  { label: 'Services', path: '/services' },
  { label: 'Settings', path: '/settings' },
];

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = React.useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="flex items-center justify-between py-4 px-6 bg-transparent text-foreground relative z-10">
      {/* Logo */}
      <Link to="/" className="flex items-center space-x-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-element bg-neon">
          <span className="text-sm font-bold text-primary-foreground">DP</span>
        </div>
        <span className="font-semibold text-xl tracking-tight text-foreground">DeployPanel</span>
      </Link>

      {/* Center Tabs - White pill with halo */}
      <div className="hidden md:flex items-center bg-panel rounded-pill p-1 border border-zinc-200">
        {/* Grid Icon */}
        <div className="p-2">
          <div className="grid grid-cols-3 gap-0.5 w-5 h-5">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="bg-zinc-400 rounded-sm" />
            ))}
          </div>
        </div>
        {/* Nav Tabs */}
        <div className="flex space-x-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || 
              (item.path === '/projects' && location.pathname.startsWith('/projects/'));
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'px-4 py-2 rounded-pill text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-neon text-primary-foreground'
                    : 'text-zinc-500 hover:text-zinc-900'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center space-x-4">
        <button className="p-2 rounded-pill bg-surface-elevated hover:bg-surface-overlay text-zinc-400 border border-zinc-700 transition-colors">
          <Search className="w-4 h-4" />
        </button>
        <button className="p-2 rounded-pill bg-surface-elevated hover:bg-surface-overlay text-zinc-400 border border-zinc-700 transition-colors relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-pill bg-neon" />
        </button>
        <button className="p-2 rounded-pill bg-surface-elevated hover:bg-surface-overlay text-zinc-400 border border-zinc-700 transition-colors">
          <HelpCircle className="w-4 h-4" />
        </button>
        <button className="p-2 rounded-pill bg-surface-elevated hover:bg-surface-overlay text-zinc-400 border border-zinc-700 transition-colors">
          <Settings className="w-4 h-4" />
        </button>
        <div className="relative">
          <button 
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-8 h-8 rounded-pill bg-zinc-700 overflow-hidden border border-zinc-600 hover:border-zinc-500 transition-colors"
          >
            <div className="w-full h-full flex items-center justify-center">
              <User className="h-4 w-4 text-zinc-300" />
            </div>
          </button>
          {showUserMenu && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setShowUserMenu(false)}
              />
              <div className="absolute right-0 mt-2 w-48 bg-panel rounded-card border border-zinc-200 shadow-lg z-20">
                <div className="p-2">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-element text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
