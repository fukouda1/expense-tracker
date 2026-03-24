import { useDisplay } from '../contexts/DisplayContext';

export default function PeriodNav() {
  const { periodLabel, goPrev, goNext, goToday, viewMode } = useDisplay();

  if (viewMode === 'custom') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 px-3 py-2 text-center">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{periodLabel}</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 px-1 py-1.5">
      <button onClick={goPrev} className="p-2 text-gray-500 dark:text-gray-400 hover:text-emerald-500 transition-colors text-lg">‹</button>
      <button onClick={goToday} className="flex-1 text-center">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{periodLabel}</p>
      </button>
      <button onClick={goNext} className="p-2 text-gray-500 dark:text-gray-400 hover:text-emerald-500 transition-colors text-lg">›</button>
    </div>
  );
}
