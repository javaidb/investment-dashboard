import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { CacheProvider } from './contexts/CacheContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Portfolio from './pages/Portfolio';
import Search from './pages/Search';
import CacheManagement from './pages/CacheManagement';
import Icons from './components/Icons';
import NotFound from './pages/NotFound';
import IconTest from './components/IconTest';

function App() {
  return (
    <div className="App">
      <CacheProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/search" element={<Search />} />
            <Route path="/icons" element={<Icons />} />
            <Route path="/cache" element={<CacheManagement />} />
            <Route path="/icons-test" element={<IconTest />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </CacheProvider>
    </div>
  );
}

export default App; 