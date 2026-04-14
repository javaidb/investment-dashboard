import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Search,
  Upload,
  TrendingUp,
  Menu,
  X,
  Database,
  Image,
  PieChart,
  Activity,
  Calculator,
  Eye,
  LineChart,
  Newspaper,
  Lightbulb,
  Receipt
} from 'lucide-react';
import { useState } from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

type NavigationItem = {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
};

type NavigationSeparator = {
  type: 'separator';
};

type NavigationElement = NavigationItem | NavigationSeparator;

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigation: NavigationElement[] = [
    { name: 'Breakdown', href: '/breakdown', icon: PieChart },
    { name: 'NewsBoard', href: '/newsboard', icon: Newspaper },
    { type: 'separator' },
    { name: 'Watchlist', href: '/watchlist', icon: Eye },
    { name: 'P&L Tracker', href: '/pnl', icon: LineChart },
    { name: 'Risk', href: '/ratios', icon: Calculator },
    { name: 'Insights', href: '/insights', icon: Lightbulb },
    { name: 'Analysis', href: '/analysis', icon: Activity },
    { name: 'Tax', href: '/tax', icon: Receipt },
    { type: 'separator' },
    { name: 'Portfolio', href: '/portfolio', icon: Upload },
    { name: 'Icons', href: '/icons', icon: Image },
    { name: 'Cache', href: '/cache', icon: Database },
    { name: 'Search', href: '/search', icon: Search },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Bar */}
      <nav>
        <div className="nav-container">
          <div className="nav-content">
            {/* Logo and Desktop Navigation */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <h1 className="nav-logo">Investment Dashboard</h1>
              </div>
              
              {/* Desktop Navigation */}
              <div className="nav-links">
                {navigation.map((item, index) => {
                  if ('type' in item && item.type === 'separator') {
                    return (
                      <div
                        key={`separator-${index}`}
                        style={{
                          width: '1px',
                          height: '24px',
                          backgroundColor: '#d1d5db',
                          margin: '1rem 2rem',
                        }}
                      />
                    );
                  }
                  const navItem = item as NavigationItem;
                  const Icon = navItem.icon;
                  return (
                    <Link
                      key={navItem.name}
                      to={navItem.href}
                      className={`nav-link ${isActive(navItem.href) ? 'active' : ''}`}
                    >
                      <Icon />
                      {navItem.name}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Right side - Live Data indicator */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div className="live-indicator">
                <div className="live-dot"></div>
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Live Data</span>
              </div>

              {/* Mobile menu button */}
              <div style={{ marginLeft: '1rem' }}>
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="mobile-menu-btn"
                >
                  {mobileMenuOpen ? (
                    <X style={{ width: '1.5rem', height: '1.5rem' }} />
                  ) : (
                    <Menu style={{ width: '1.5rem', height: '1.5rem' }} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {mobileMenuOpen && (
          <div className="mobile-menu active">
            {navigation.map((item, index) => {
              if ('type' in item && item.type === 'separator') {
                return (
                  <div
                    key={`separator-${index}`}
                    style={{
                      height: '1px',
                      backgroundColor: '#d1d5db',
                      margin: '0.5rem 1rem',
                    }}
                  />
                );
              }
              const navItem = item as NavigationItem;
              const Icon = navItem.icon;
              return (
                <Link
                  key={navItem.name}
                  to={navItem.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`mobile-nav-link ${isActive(navItem.href) ? 'active' : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Icon style={{ marginRight: '0.75rem', width: '1.25rem', height: '1.25rem' }} />
                    {navItem.name}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main style={{ flex: '1' }}>
        {children}
      </main>
    </div>
  );
};

export default Layout; 