import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { DataProvider } from './contexts/DataContext';
import { DisplayProvider } from './contexts/DisplayContext';
import { ToastProvider } from './components/Toast';
import OfflineIndicator from './components/OfflineIndicator';
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

export default function App() {
  return (
    <ThemeProvider>
      <DataProvider>
        <DisplayProvider>
          <ToastProvider>
            <OfflineIndicator />
            <BrowserRouter>
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
    </ThemeProvider>
  );
}
