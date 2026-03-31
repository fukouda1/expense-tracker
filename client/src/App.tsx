import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { ThemeProvider } from './contexts/ThemeContext';
import { DataProvider, useData } from './contexts/DataContext';
import { DisplayProvider } from './contexts/DisplayContext';
import { CurrencyProvider } from './contexts/CurrencyContext';
import { ToastProvider } from './components/Toast';
import OfflineIndicator from './components/OfflineIndicator';
import { useAutoBackupCheck } from './components/AutoBackup';
import PinLock from './components/PinLock';
import Layout from './components/Layout';

// Code-split pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AddTransaction = lazy(() => import('./pages/AddTransaction'));
const Transactions = lazy(() => import('./pages/Transactions'));
const CalendarView = lazy(() => import('./pages/CalendarView'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Settings = lazy(() => import('./pages/Settings'));
const Search = lazy(() => import('./pages/Search'));
const DebtTracker = lazy(() => import('./pages/DebtTracker'));
const Accounts = lazy(() => import('./pages/Accounts'));

function Loading() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function SplashScreen() {
  return (
    <div className="fixed inset-0 z-[200] bg-gradient-to-br from-[#082f23] via-[#0f766e] to-[#065f46] flex flex-col items-center justify-center">
      <img src="/favicon.svg" alt="TraceCash" className="w-28 h-28 mb-4 animate-pulse" />
      <h1 className="text-2xl font-bold text-white tracking-wide">TraceCash</h1>
      <p className="text-sm text-emerald-300/60 mt-1">Trace your cash</p>
      <div className="mt-8 w-8 h-8 border-3 border-emerald-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AutoBackupRunner() {
  useAutoBackupCheck();
  return null;
}

/** Handles Android hardware back button: closes open modals, navigates back, or does nothing at root. */
function BackButtonHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const listener = CapacitorApp.addListener('backButton', () => {
      // Close any open modal first
      const openModal = document.querySelector('.fixed.inset-0');
      if (openModal) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return;
      }
      // Navigate back only if not already at the root — prevents closing the app
      if (location.pathname !== '/') {
        navigate(-1);
      }
      // At root with no modals: do nothing (app stays open)
    });
    return () => { listener.then(h => h.remove()); };
  }, [navigate, location.pathname]);
  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <PinLock>
      <CurrencyProvider>
        <DataProvider>
          <AppContent />
        </DataProvider>
      </CurrencyProvider>
      </PinLock>
    </ThemeProvider>
  );
}

function AppContent() {
  const { loading } = useData();
  const [initialLoaded, setInitialLoaded] = useState(false);

  useEffect(() => {
    if (!loading && !initialLoaded) setInitialLoaded(true);
  }, [loading, initialLoaded]);

  if (!initialLoaded && loading) return <SplashScreen />;

  return (
    <DisplayProvider>
      <ToastProvider>
        <OfflineIndicator />
        <AutoBackupRunner />
        <BrowserRouter>
          <BackButtonHandler />
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/calendar" element={<CalendarView />} />
                <Route path="/analytics" element={<Analytics />} />
              </Route>
              <Route path="/add" element={<AddTransaction />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/search" element={<Search />} />
              <Route path="/debts" element={<DebtTracker />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </DisplayProvider>
  );
}
