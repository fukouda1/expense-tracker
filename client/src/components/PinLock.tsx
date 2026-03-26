import { useState, useEffect, useCallback } from 'react';

const LS_PIN_ENABLED = 'tracecash_pin_enabled';
const LS_PIN_HASH = 'tracecash_pin_hash';
const LS_PIN_VERIFIED = 'tracecash_pin_verified';

/** Simple hash for PIN storage (not cryptographically secure, but sufficient for local lock) */
function hashPin(pin: string): string {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    const ch = pin.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return 'pin_' + Math.abs(hash).toString(36);
}

export function isPinEnabled(): boolean {
  return localStorage.getItem(LS_PIN_ENABLED) === 'true' && !!localStorage.getItem(LS_PIN_HASH);
}

export function setPinEnabled(enabled: boolean): void {
  localStorage.setItem(LS_PIN_ENABLED, enabled ? 'true' : 'false');
  if (!enabled) {
    localStorage.removeItem(LS_PIN_HASH);
    sessionStorage.removeItem(LS_PIN_VERIFIED);
  }
}

export function savePin(pin: string): void {
  localStorage.setItem(LS_PIN_HASH, hashPin(pin));
  localStorage.setItem(LS_PIN_ENABLED, 'true');
}

export function verifyPin(pin: string): boolean {
  return localStorage.getItem(LS_PIN_HASH) === hashPin(pin);
}

export function markVerified(): void {
  sessionStorage.setItem(LS_PIN_VERIFIED, 'true');
}

export function isVerified(): boolean {
  return sessionStorage.getItem(LS_PIN_VERIFIED) === 'true';
}

/** PIN entry overlay shown on app start when PIN lock is enabled */
export default function PinLock({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (isPinEnabled() && !isVerified()) {
      setLocked(true);
    }
  }, []);

  const handleDigit = useCallback((digit: string) => {
    setError('');
    setPin(prev => {
      const next = prev + digit;
      if (next.length === 4) {
        if (verifyPin(next)) {
          markVerified();
          setLocked(false);
        } else {
          setError('Wrong PIN');
          setShake(true);
          setTimeout(() => setShake(false), 500);
          return '';
        }
      }
      return next.length <= 4 ? next : prev;
    });
  }, []);

  const handleDelete = useCallback(() => {
    setError('');
    setPin(prev => prev.slice(0, -1));
  }, []);

  if (!locked) return <>{children}</>;

  const dots = Array.from({ length: 4 }, (_, i) => (
    <div
      key={i}
      className={`w-4 h-4 rounded-full border-2 transition-all ${
        i < pin.length
          ? 'bg-emerald-500 border-emerald-500 scale-110'
          : 'border-gray-400 dark:border-gray-500'
      }`}
    />
  ));

  const numpad = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'del'],
  ];

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center select-none">
      {/* Logo area */}
      <div className="mb-8 text-center">
        <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">Enter your PIN to unlock</p>
      </div>

      {/* PIN dots */}
      <div className={`flex gap-4 mb-2 ${shake ? 'animate-shake' : ''}`}>
        {dots}
      </div>

      {/* Error message */}
      <div className="h-6 flex items-center">
        {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        {numpad.flat().map((key, i) => {
          if (key === '') return <div key={i} />;
          if (key === 'del') {
            return (
              <button
                key={i}
                onClick={handleDelete}
                className="w-18 h-14 flex items-center justify-center rounded-xl text-gray-600 dark:text-gray-300 active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                  <line x1="18" y1="9" x2="12" y2="15" />
                  <line x1="12" y1="9" x2="18" y2="15" />
                </svg>
              </button>
            );
          }
          return (
            <button
              key={i}
              onClick={() => handleDigit(key)}
              className="w-18 h-14 flex items-center justify-center rounded-xl text-xl font-semibold text-gray-900 dark:text-white bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 active:bg-emerald-50 dark:active:bg-emerald-900/30 active:border-emerald-300 transition-colors shadow-sm"
            >
              {key}
            </button>
          );
        })}
      </div>

      {/* Shake animation style */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
}

/** Settings component for PIN setup — used in Settings page */
export function PinLockSettings() {
  const [enabled, setEnabled] = useState(isPinEnabled());
  const [showSetup, setShowSetup] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [setupError, setSetupError] = useState('');

  const handleToggle = () => {
    if (enabled) {
      setPinEnabled(false);
      setEnabled(false);
    } else {
      setShowSetup(true);
      setStep('enter');
      setNewPin('');
      setConfirmPin('');
      setSetupError('');
    }
  };

  const handleSetupDigit = (digit: string) => {
    setSetupError('');
    if (step === 'enter') {
      const next = newPin + digit;
      if (next.length <= 4) setNewPin(next);
      if (next.length === 4) {
        setTimeout(() => {
          setStep('confirm');
        }, 200);
      }
    } else {
      const next = confirmPin + digit;
      if (next.length <= 4) setConfirmPin(next);
      if (next.length === 4) {
        if (next === newPin) {
          savePin(next);
          markVerified();
          setEnabled(true);
          setShowSetup(false);
        } else {
          setSetupError('PINs do not match');
          setConfirmPin('');
        }
      }
    }
  };

  const handleSetupDelete = () => {
    setSetupError('');
    if (step === 'enter') {
      setNewPin(prev => prev.slice(0, -1));
    } else {
      setConfirmPin(prev => prev.slice(0, -1));
    }
  };

  const currentPin = step === 'enter' ? newPin : confirmPin;

  const numpad = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'del'],
  ];

  return (
    <>
      <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-500/40">
        <div>
          <span className="text-sm text-gray-900 dark:text-white">PIN Lock</span>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Require 4-digit PIN on app open</p>
        </div>
        <button onClick={handleToggle} className={`w-12 h-6 rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}>
          <div className={`w-5 h-5 bg-white rounded-full transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* PIN Setup Modal */}
      {showSetup && (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center" onClick={() => setShowSetup(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-72 max-w-[90vw]" onClick={e => e.stopPropagation()}>
            <h3 className="text-center text-sm font-semibold text-gray-900 dark:text-white mb-1">
              {step === 'enter' ? 'Set New PIN' : 'Confirm PIN'}
            </h3>
            <p className="text-center text-xs text-gray-500 dark:text-gray-400 mb-4">
              {step === 'enter' ? 'Choose a 4-digit PIN' : 'Enter the same PIN again'}
            </p>

            {/* Dots */}
            <div className="flex gap-3 justify-center mb-2">
              {Array.from({ length: 4 }, (_, i) => (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                    i < currentPin.length
                      ? 'bg-emerald-500 border-emerald-500'
                      : 'border-gray-400 dark:border-gray-500'
                  }`}
                />
              ))}
            </div>

            {/* Error */}
            <div className="h-5 flex items-center justify-center">
              {setupError && <p className="text-xs text-red-500">{setupError}</p>}
            </div>

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-2 mt-2">
              {numpad.flat().map((key, i) => {
                if (key === '') return <div key={i} />;
                if (key === 'del') {
                  return (
                    <button
                      key={i}
                      onClick={handleSetupDelete}
                      className="h-11 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-700"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                        <line x1="18" y1="9" x2="12" y2="15" />
                        <line x1="12" y1="9" x2="18" y2="15" />
                      </svg>
                    </button>
                  );
                }
                return (
                  <button
                    key={i}
                    onClick={() => handleSetupDigit(key)}
                    className="h-11 flex items-center justify-center rounded-lg text-lg font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 active:bg-emerald-50 dark:active:bg-emerald-900/30 transition-colors"
                  >
                    {key}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setShowSetup(false)}
              className="w-full mt-4 py-2 text-xs text-gray-500 dark:text-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
