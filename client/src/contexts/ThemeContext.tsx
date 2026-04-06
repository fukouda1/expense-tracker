import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

type ThemeMode = 'light' | 'dark' | 'auto' | 'schedule';

interface ThemeContextType {
  dark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
  schedule: { darkFrom: string; darkTo: string };
  setSchedule: (s: { darkFrom: string; darkTo: string }) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  dark: false, mode: 'auto', setMode: () => {}, toggle: () => {},
  schedule: { darkFrom: '18:00', darkTo: '06:00' }, setSchedule: () => {},
});

function isInSchedule(from: string, to: string): boolean {
  const now = new Date();
  const [fH, fM] = from.split(':').map(Number);
  const [tH, tM] = to.split(':').map(Number);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const fromMin = fH * 60 + fM;
  const toMin = tH * 60 + tM;
  if (fromMin <= toMin) return nowMin >= fromMin && nowMin < toMin;
  return nowMin >= fromMin || nowMin < toMin; // overnight range
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem('tracecash_theme_mode') as ThemeMode) || 'auto';
  });
  const [schedule, setScheduleState] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tracecash_theme_schedule') || '{}'); }
    catch { return {}; }
  });
  const darkFrom = schedule.darkFrom || '18:00';
  const darkTo = schedule.darkTo || '06:00';

  const computeDark = useCallback((): boolean => {
    if (mode === 'light') return false;
    if (mode === 'dark') return true;
    if (mode === 'schedule') return isInSchedule(darkFrom, darkTo);
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, [mode, darkFrom, darkTo]);

  const [dark, setDark] = useState(computeDark);

  useEffect(() => {
    setDark(computeDark());
    if (mode === 'schedule') {
      const interval = setInterval(() => setDark(computeDark()), 60000);
      return () => clearInterval(interval);
    }
  }, [computeDark, mode]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem('tracecash_theme_mode', m);
  };

  const setSchedule = (s: { darkFrom: string; darkTo: string }) => {
    setScheduleState(s);
    localStorage.setItem('tracecash_theme_schedule', JSON.stringify(s));
  };

  const toggle = () => {
    if (mode === 'schedule' || mode === 'auto') {
      setMode(dark ? 'light' : 'dark');
    } else {
      setMode(dark ? 'light' : 'dark');
    }
  };

  return (
    <ThemeContext.Provider value={{ dark, mode, setMode, toggle, schedule: { darkFrom, darkTo }, setSchedule }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
