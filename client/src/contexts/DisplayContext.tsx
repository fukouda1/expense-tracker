import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export type ViewMode = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'biyearly' | 'yearly' | 'custom';

export interface DisplaySettings {
  viewMode: ViewMode;
  showTotal: boolean;
  carryOver: boolean;
  customFrom: string;
  customTo: string;
  setViewMode: (m: ViewMode) => void;
  setShowTotal: (v: boolean) => void;
  setCarryOver: (v: boolean) => void;
  setCustomRange: (from: string, to: string) => void;
  // Period navigation
  period: string; // current period key
  periodLabel: string;
  goPrev: () => void;
  goNext: () => void;
  goToday: () => void;
  getPeriodRange: () => { from: string; to: string };
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function currentMonthStr() { return new Date().toISOString().slice(0, 7); }

function shiftDate(d: string, days: number): string {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getWeekStart(d: string): string {
  const dt = new Date(d);
  dt.setDate(dt.getDate() - dt.getDay());
  return dt.toISOString().slice(0, 10);
}

function getQuarterStart(d: string): string {
  const [y, m] = d.split('-').map(Number);
  const qStart = Math.floor((m - 1) / 3) * 3 + 1;
  return `${y}-${String(qStart).padStart(2, '0')}`;
}

function getHalfStart(d: string): string {
  const [y, m] = d.split('-').map(Number);
  return m <= 6 ? `${y}-01` : `${y}-07`;
}

function getYearStr(d: string): string {
  return d.split('-')[0];
}

function getInitialPeriod(mode: ViewMode): string {
  if (mode === 'daily') return todayStr();
  if (mode === 'weekly') return getWeekStart(todayStr());
  if (mode === 'quarterly') return getQuarterStart(currentMonthStr());
  if (mode === 'biyearly') return getHalfStart(currentMonthStr());
  if (mode === 'yearly') return getYearStr(currentMonthStr());
  return currentMonthStr(); // monthly + custom
}

function computePeriodRange(mode: ViewMode, period: string, customFrom: string, customTo: string): { from: string; to: string } {
  if (mode === 'custom') {
    return { from: customFrom, to: customTo + 'T23:59:59' };
  }
  if (mode === 'daily') {
    return { from: period, to: period + 'T23:59:59' };
  }
  if (mode === 'weekly') {
    return { from: period, to: shiftDate(period, 6) + 'T23:59:59' };
  }
  if (mode === 'monthly') {
    const [y, m] = period.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return { from: `${period}-01`, to: `${period}-${String(lastDay).padStart(2, '0')}T23:59:59` };
  }
  if (mode === 'quarterly') {
    const endMonth = shiftMonth(period, 2);
    const [y, m] = endMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return { from: `${period}-01`, to: `${endMonth}-${String(lastDay).padStart(2, '0')}T23:59:59` };
  }
  if (mode === 'biyearly') {
    const endMonth = shiftMonth(period, 5);
    const [y, m] = endMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return { from: `${period}-01`, to: `${endMonth}-${String(lastDay).padStart(2, '0')}T23:59:59` };
  }
  if (mode === 'yearly') {
    return { from: `${period}-01-01`, to: `${period}-12-31T23:59:59` };
  }
  return { from: `${period}-01`, to: `${period}-31T23:59:59` };
}

function computePeriodLabel(mode: ViewMode, period: string, customFrom: string, customTo: string): string {
  if (mode === 'custom') {
    if (!customFrom || !customTo) return 'Select dates';
    const f = new Date(customFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const t = new Date(customTo).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${f} – ${t}`;
  }
  if (mode === 'daily') {
    return new Date(period).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
  }
  if (mode === 'weekly') {
    const end = shiftDate(period, 6);
    const f = new Date(period).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const t = new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${f} – ${t}`;
  }
  if (mode === 'monthly') {
    const [y, m] = period.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  if (mode === 'quarterly') {
    const [y, m] = period.split('-').map(Number);
    const q = Math.floor((m - 1) / 3) + 1;
    return `Q${q} ${y}`;
  }
  if (mode === 'biyearly') {
    const [y, m] = period.split('-').map(Number);
    return m <= 6 ? `H1 ${y}` : `H2 ${y}`;
  }
  if (mode === 'yearly') {
    return period;
  }
  return period;
}

const DisplayContext = createContext<DisplaySettings>(null!);

export function DisplayProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => (localStorage.getItem('mymoney_view_mode') as ViewMode) || 'monthly');
  const [showTotal, setShowTotalState] = useState(() => localStorage.getItem('mymoney_show_total') !== '0');
  const [carryOver, setCarryOverState] = useState(() => localStorage.getItem('mymoney_carry_over') === '1');
  const [period, setPeriod] = useState(() => getInitialPeriod((localStorage.getItem('mymoney_view_mode') as ViewMode) || 'monthly'));
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const setViewMode = useCallback((m: ViewMode) => {
    setViewModeState(m);
    localStorage.setItem('mymoney_view_mode', m);
    if (m !== 'custom') setPeriod(getInitialPeriod(m));
  }, []);

  const setShowTotal = useCallback((v: boolean) => {
    setShowTotalState(v);
    localStorage.setItem('mymoney_show_total', v ? '1' : '0');
  }, []);

  const setCarryOver = useCallback((v: boolean) => {
    setCarryOverState(v);
    localStorage.setItem('mymoney_carry_over', v ? '1' : '0');
  }, []);

  const setCustomRange = useCallback((from: string, to: string) => {
    setCustomFrom(from);
    setCustomTo(to);
  }, []);

  const goPrev = useCallback(() => {
    setPeriod(prev => {
      if (viewMode === 'daily') return shiftDate(prev, -1);
      if (viewMode === 'weekly') return shiftDate(prev, -7);
      if (viewMode === 'monthly') return shiftMonth(prev, -1);
      if (viewMode === 'quarterly') return shiftMonth(prev, -3);
      if (viewMode === 'biyearly') return shiftMonth(prev, -6);
      if (viewMode === 'yearly') return String(Number(prev) - 1);
      return prev;
    });
  }, [viewMode]);

  const goNext = useCallback(() => {
    setPeriod(prev => {
      if (viewMode === 'daily') return shiftDate(prev, 1);
      if (viewMode === 'weekly') return shiftDate(prev, 7);
      if (viewMode === 'monthly') return shiftMonth(prev, 1);
      if (viewMode === 'quarterly') return shiftMonth(prev, 3);
      if (viewMode === 'biyearly') return shiftMonth(prev, 6);
      if (viewMode === 'yearly') return String(Number(prev) + 1);
      return prev;
    });
  }, [viewMode]);

  const goToday = useCallback(() => {
    setPeriod(getInitialPeriod(viewMode));
  }, [viewMode]);

  const getPeriodRange = useCallback(() => {
    return computePeriodRange(viewMode, period, customFrom, customTo);
  }, [viewMode, period, customFrom, customTo]);

  const periodLabel = computePeriodLabel(viewMode, period, customFrom, customTo);

  return (
    <DisplayContext.Provider value={{
      viewMode, showTotal, carryOver, customFrom, customTo,
      setViewMode, setShowTotal, setCarryOver, setCustomRange,
      period, periodLabel, goPrev, goNext, goToday, getPeriodRange,
    }}>
      {children}
    </DisplayContext.Provider>
  );
}

export const useDisplay = () => useContext(DisplayContext);
