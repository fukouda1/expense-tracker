import { useState } from 'react';
import Modal from './Modal';
import { useDisplay, type ViewMode } from '../contexts/DisplayContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: 'daily', label: 'DAILY' },
  { value: 'weekly', label: 'WEEKLY' },
  { value: 'monthly', label: 'MONTHLY' },
  { value: 'quarterly', label: 'QUARTERLY' },
  { value: 'biyearly', label: 'BI-YEARLY' },
  { value: 'yearly', label: 'YEARLY' },
  { value: 'custom', label: 'DATE RANGE' },
];

export default function DisplayOptionsModal({ open, onClose }: Props) {
  const { viewMode, setViewMode, showTotal, setShowTotal, carryOver, setCarryOver,
    customFrom, customTo, setCustomRange } = useDisplay();
  const [localFrom, setLocalFrom] = useState(customFrom);
  const [localTo, setLocalTo] = useState(customTo);

  const handleModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode !== 'custom') onClose();
  };

  const applyCustomRange = () => {
    if (localFrom && localTo) {
      setCustomRange(localFrom, localTo);
      setViewMode('custom');
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Display options">
      <div className="space-y-5">
        {/* View Mode */}
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">View mode:</p>
          <div className="space-y-0.5">
            {VIEW_MODES.map(opt => (
              <button
                key={opt.value}
                onClick={() => opt.value === 'custom' ? setViewMode('custom') : handleModeChange(opt.value)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === opt.value
                    ? 'text-gray-900 dark:text-white'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                {viewMode === opt.value && <span className="mr-2">✓</span>}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Range */}
        {viewMode === 'custom' && (
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500 uppercase block mb-0.5">From</label>
                <input type="date" value={localFrom} onChange={e => setLocalFrom(e.target.value)}
                  className="w-full p-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase block mb-0.5">To</label>
                <input type="date" value={localTo} onChange={e => setLocalTo(e.target.value)}
                  className="w-full p-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white" />
              </div>
            </div>
            <button onClick={applyCustomRange} disabled={!localFrom || !localTo}
              className="w-full py-2 bg-emerald-500 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg text-sm font-medium">
              Apply Range
            </button>
          </div>
        )}

        {/* Show Total */}
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Show total:</p>
          <div className="flex gap-3">
            <button onClick={() => setShowTotal(true)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${showTotal ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
              {showTotal && '✓ '}YES
            </button>
            <button onClick={() => setShowTotal(false)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${!showTotal ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
              {!showTotal && '✓ '}NO
            </button>
          </div>
        </div>

        {/* Carry Over */}
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Carry over:</p>
          <div className="flex gap-3">
            <button onClick={() => setCarryOver(true)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${carryOver ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
              {carryOver && '✓ '}ON
            </button>
            <button onClick={() => setCarryOver(false)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${!carryOver ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
              {!carryOver && '✓ '}OFF
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 flex items-start gap-1.5">
            <span className="mt-0.5">ℹ</span>
            With Carry over enabled, monthly surplus will be added to the next month.
          </p>
        </div>
      </div>
    </Modal>
  );
}
