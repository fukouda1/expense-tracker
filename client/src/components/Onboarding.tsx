import { useState } from 'react';

const ONBOARDING_KEY = 'tracecash_onboarding_done';

const steps = [
  {
    icon: '👋',
    title: 'Welcome to TraceCash!',
    description: 'Your personal expense tracker. Track where your money goes, set budgets, and reach your savings goals.',
  },
  {
    icon: '➕',
    title: 'Add Transactions',
    description: 'Tap the + button to record expenses, income, or transfers. Use the calculator-style input for quick amounts.',
  },
  {
    icon: '📂',
    title: 'Organize with Categories',
    description: 'Categorize your spending to see where your money goes. Go to Settings to create custom categories.',
  },
  {
    icon: '🎯',
    title: 'Set Budgets',
    description: 'Set monthly budgets per category or overall. Get alerts when you reach 80% or go over budget.',
  },
  {
    icon: '🔄',
    title: 'Recurring Transactions',
    description: 'Set up recurring bills and income to auto-track monthly expenses. Never miss a payment.',
  },
  {
    icon: '📊',
    title: 'Analyze Your Spending',
    description: 'View charts, trends, and breakdowns in the Analytics tab. Compare months and track your savings rate.',
  },
  {
    icon: '📥',
    title: 'Backup Your Data',
    description: 'Export your data as XLSX or CSV from Settings. Enable auto-backup to save weekly to your Downloads folder.',
  },
];

export function useOnboarding() {
  const [done, setDone] = useState(() => localStorage.getItem(ONBOARDING_KEY) === 'true');
  const markDone = () => { localStorage.setItem(ONBOARDING_KEY, 'true'); setDone(true); };
  return { showOnboarding: !done, markDone };
}

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[250] bg-gradient-to-br from-[#082f23] via-[#0f766e] to-[#065f46] flex flex-col items-center justify-center px-8">
      {/* Progress dots */}
      <div className="flex gap-1.5 mb-8">
        {steps.map((_, i) => (
          <div key={i} className={`w-2 h-2 rounded-full transition-all ${i === step ? 'bg-emerald-400 w-6' : i < step ? 'bg-emerald-500' : 'bg-white/20'}`} />
        ))}
      </div>

      {/* Content */}
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-6">{current.icon}</div>
        <h2 className="text-2xl font-bold text-white mb-3">{current.title}</h2>
        <p className="text-emerald-200/80 text-sm leading-relaxed">{current.description}</p>
      </div>

      {/* Buttons */}
      <div className="flex gap-3 mt-10 w-full max-w-sm">
        {step > 0 && (
          <button onClick={() => setStep(s => s - 1)} className="flex-1 py-3 bg-white/10 text-white rounded-xl text-sm font-medium">
            Back
          </button>
        )}
        <button
          onClick={() => {
            if (isLast) onComplete();
            else setStep(s => s + 1);
          }}
          className="flex-1 py-3 bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/30"
        >
          {isLast ? 'Get Started!' : 'Next'}
        </button>
      </div>

      {/* Skip */}
      {!isLast && (
        <button onClick={onComplete} className="mt-4 text-white/40 text-xs">
          Skip tutorial
        </button>
      )}
    </div>
  );
}
