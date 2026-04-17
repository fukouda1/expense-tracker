import { useState, useRef, type ReactNode } from 'react';

interface Props {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

export default function PullToRefresh({ onRefresh, children }: Props) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const startX = useRef(0);
  const locked = useRef<'none' | 'vertical' | 'horizontal'>('none');
  const containerRef = useRef<HTMLDivElement>(null);
  const threshold = 60;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
      locked.current = 'none';
      setPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!pulling || refreshing) return;
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

    if (pullDistance >= threshold && !refreshing) {
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
      ref={containerRef}
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
