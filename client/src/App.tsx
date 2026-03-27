import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { ThemeProvider } from './contexts/ThemeContext';
import { DataProvider } from './contexts/DataContext';
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
        </DataProvider>
      </CurrencyProvider>
      </PinLock>
    </ThemeProvider>
  );
}
