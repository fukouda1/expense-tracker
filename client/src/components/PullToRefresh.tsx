import { useState, useRef, type ReactNode } from 'react';

interface Props {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

/** Current window scroll offset — the app scrolls the window, not an inner div (see Layout.tsx). */
function getScrollTop(): number {
  return window.scrollY || document.documentElement.scrollTop || 0;
}

export default function PullToRefresh({ onRefresh, children }: Props) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const startX = useRef(0);
  const locked = useRef<'none' | 'vertical' | 'horizontal'>('none');
  const threshold = 60;

  const handleTouchStart = (e: React.TouchEvent) => {
    // Only arm pull-to-refresh when the PAGE is scrolled to the very top.
    // Critical: the window is the scroll container — checking a wrapper div's
    // scrollTop (which is always 0 because it doesn't scroll) would arm the
    // pull anywhere on the page and refresh mid-list on any downward drag.
    if (getScrollTop() <= 0) {
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
      locked.current = 'none';
      setPulling(true);
    } else {
      setPulling(false);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!pulling || refreshing) return;

    // If the page has scrolled away from the top during the gesture, abort.
    if (getScrollTop() > 0) {
      setPulling(false);
      setPullDistance(0);
      return;
    }

    const dy = e.touches[0].clientY - startY.current;
    const dx = e.touches[0].clientX - startX.current;

    // Lock to horizontal or vertical once movement exceeds small threshold — prevents
    // horizontal swipes (e.g. SwipeableCard) from triggering pull-to-refresh.
    if (locked.current === 'none' && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      locked.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }
    if (locked.current === 'horizontal') return;

    if (dy > 0) {
      setPullDistance(Math.min(dy * 0.5, 80));
    }
  };

  const handleTouchEnd = async () => {
    // Horizontal gesture — never trigger refresh
    if (locked.current === 'horizontal') {
      setPullDistance(0);
      setPulling(false);
      locked.current = 'none';
      return;
    }

    if (pulling && pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      setPullDistance(40);
      try { await onRefresh(); } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
    setPulling(false);
    locked.current = 'none';
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
    >
      {/* Pull indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-all"
        style={{ height: pullDistance }}
      >
        <div className={`text-emerald-500 text-xl ${refreshing ? 'animate-spin' : ''}`}>
          {refreshing ? '⟳' : pullDistance >= threshold ? '↓' : '↑'}
        </div>
      </div>
      {children}
    </div>
  );
}
