import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { CacheProvider } from './contexts/CacheContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Portfolio from './pages/Portfolio';
import Search from './pages/Search';
import CacheManagement from './pages/CacheManagement';
import NotFound from './pages/NotFound';

function App() {
  return (
    <div className="App">
      <CacheProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/search" element={<Search />} />
            <Route path="/cache" element={<CacheManagement />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </CacheProvider>
    </div>
  );
}

export default App; 