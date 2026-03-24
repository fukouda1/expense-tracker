import { useState, useRef, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftLabel?: string;
  rightLabel?: string;
  leftColor?: string;
  rightColor?: string;
}

export default function SwipeableCard({ children, onSwipeLeft, onSwipeRight, leftLabel = '🗑️ Delete', rightLabel = '✏️ Edit', leftColor = 'bg-red-500', rightColor = 'bg-blue-500' }: Props) {
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const swiping = useRef(false);
  const threshold = 80;

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    swiping.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (!swiping.current && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      swiping.current = true;
    }
    if (swiping.current) {
      e.preventDefault();
      const max = 120;
      setOffsetX(Math.max(-max, Math.min(max, dx)));
    }
  };

  const handleTouchEnd = () => {
    if (offsetX < -threshold && onSwipeLeft) {
      onSwipeLeft();
    } else if (offsetX > threshold && onSwipeRight) {
      onSwipeRight();
    }
    setOffsetX(0);
    swiping.current = false;
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Background actions */}
      <div className="absolute inset-0 flex">
        <div className={`flex-1 ${rightColor} flex items-center pl-4`}>
          <span className="text-white text-xs font-medium">{rightLabel}</span>
        </div>
        <div className={`flex-1 ${leftColor} flex items-center justify-end pr-4`}>
          <span className="text-white text-xs font-medium">{leftLabel}</span>
        </div>
      </div>
      {/* Foreground card */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative transition-transform"
        style={{ transform: `translateX(${offsetX}px)`, transitionDuration: offsetX === 0 ? '0.3s' : '0s' }}
      >
        {children}
      </div>
    </div>
  );
}
