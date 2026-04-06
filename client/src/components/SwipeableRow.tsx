import { useRef, useState, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function SwipeableRow({ children, onEdit, onDelete }: Props) {
  const [offset, setOffset] = useState(0);
  const startX = useRef(0);
  const swiping = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    swiping.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swiping.current) return;
    const diff = e.touches[0].clientX - startX.current;
    // Only allow left swipe (negative)
    if (diff < 0) {
      setOffset(Math.max(diff, -120));
    } else if (offset < 0) {
      setOffset(Math.min(0, offset + diff));
    }
  };

  const handleTouchEnd = () => {
    swiping.current = false;
    // Snap: if swiped past threshold, keep open; otherwise close
    if (offset < -60) {
      setOffset(-120);
    } else {
      setOffset(0);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Action buttons behind */}
      <div className="absolute right-0 top-0 bottom-0 flex items-stretch" style={{ width: 120 }}>
        {onEdit && (
          <button onClick={() => { setOffset(0); onEdit(); }} className="flex-1 bg-blue-500 text-white flex items-center justify-center text-xs font-medium">
            ✏️ Edit
          </button>
        )}
        {onDelete && (
          <button onClick={() => { setOffset(0); onDelete(); }} className="flex-1 bg-red-500 text-white flex items-center justify-center text-xs font-medium">
            🗑️ Delete
          </button>
        )}
      </div>
      {/* Swipeable content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => { if (offset < 0) setOffset(0); }}
        style={{ transform: `translateX(${offset}px)`, transition: swiping.current ? 'none' : 'transform 0.2s ease-out' }}
        className="relative z-10 bg-white dark:bg-gray-800"
      >
        {children}
      </div>
    </div>
  );
}
