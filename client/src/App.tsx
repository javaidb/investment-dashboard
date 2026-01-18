import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { CacheProvider } from './contexts/CacheContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Breakdown from './pages/Breakdown';
import Watchlist from './pages/Watchlist';
import Analysis from './pages/Analysis';
import Ratios from './pages/Ratios';
import Portfolio from './pages/Portfolio';
import Search from './pages/Search';
import CacheManagement from './pages/CacheManagement';
import PnLTracker from './pages/PnLTracker';
import Insights from './pages/Insights';
import NewsBoard from './components/NewsBoard';
import Icons from './components/Icons';
import NotFound from './pages/NotFound';
import IconTest from './components/IconTest';

function App() {
  return (
    <div className="App">
      <CacheProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Breakdown />} />
            <Route path="/breakdown" element={<Breakdown />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/ratios" element={<Ratios />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/pnl" element={<PnLTracker />} />
            <Route path="/newsboard" element={<NewsBoard />} />
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