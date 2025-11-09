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
  Calculator
} from 'lucide-react';
import { useState } from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigation = [
    { name: 'Breakdown', href: '/breakdown', icon: PieChart },
    { name: 'Trends', href: '/trends', icon: TrendingUp },
    { name: 'Analysis', href: '/analysis', icon: Activity },
    { name: 'Ratios', href: '/ratios', icon: Calculator },
    { name: 'Search', href: '/search', icon: Search },
    { name: 'Portfolio', href: '/portfolio', icon: Upload },
    { name: 'Icons', href: '/icons', icon: Image },
    { name: 'Cache', href: '/cache', icon: Database },
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
                {navigation.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`nav-link ${isActive(item.href) ? 'active' : ''}`}
                    >
                      <Icon />
                      {item.name}
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
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`mobile-nav-link ${isActive(item.href) ? 'active' : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Icon style={{ marginRight: '0.75rem', width: '1.25rem', height: '1.25rem' }} />
                    {item.name}
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