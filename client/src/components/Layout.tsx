import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

const mainNav = [
  { to: '/', icon: '🏠', label: 'Home' },
  { to: '/transactions', icon: '📋', label: 'History' },
  { to: '/add', icon: '➕', label: 'Add' },
  { to: '/accounts', icon: '🏦', label: 'Accounts' },
  { to: '/more', icon: '☰', label: 'More' },
];

const moreItems = [
  { to: '/analytics', icon: '📊', label: 'Analytics' },
  { to: '/calendar', icon: '📅', label: 'Calendar' },
  { to: '/debts', icon: '💰', label: 'Debts' },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
  { to: '/search', icon: '🔍', label: 'Search' },
];

export default function Layout() {
  const [showMore, setShowMore] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="min-h-[100dvh] bg-gray-50 dark:bg-gray-900 flex flex-col">
      <main className="flex-1 pb-20 w-full max-w-2xl mx-auto">
        <Outlet />
      </main>

      {/* More menu overlay */}
      {showMore && (
        <div className="fixed inset-0 z-[60]" onClick={() => setShowMore(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute bottom-16 right-2 sm:right-[calc(50%-16rem)] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-2 w-48 animate-slide-up">
            {moreItems.map(item => (
              <button
                key={item.to}
                onClick={(e) => { e.stopPropagation(); setShowMore(false); navigate(item.to); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <span className="text-base">{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-50 safe-bottom">
        <div className="max-w-2xl mx-auto flex justify-around items-center h-14 sm:h-16">
          {mainNav.map(item => {
            if (item.to === '/more') {
              return (
                <button
                  key="more"
                  onClick={() => setShowMore(s => !s)}
                  className={`flex flex-col items-center gap-0.5 px-2 sm:px-3 py-1 rounded-lg transition-colors ${
                    showMore ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <span className="text-lg sm:text-xl">{item.icon}</span>
                  <span className="text-[9px] sm:text-[10px] font-medium">{item.label}</span>
                </button>
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setShowMore(false)}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 px-2 sm:px-3 py-1 rounded-lg transition-colors ${
                    item.to === '/add'
                      ? 'bg-emerald-500 text-white -mt-5 sm:-mt-6 w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shadow-lg'
                      : isActive
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-gray-500 dark:text-gray-400'
                  }`
                }
              >
                <span className={item.to === '/add' ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl'}>{item.icon}</span>
                {item.to !== '/add' && (
                  <span className="text-[9px] sm:text-[10px] font-medium">{item.label}</span>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
