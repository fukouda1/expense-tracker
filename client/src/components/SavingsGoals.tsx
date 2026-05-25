import { useState } from 'react';
import { formatCurrency } from '../utils/formatters';
import Modal from './Modal';
import AmountInput from './AmountInput';

interface Goal {
  id: string;
  name: string;
  target: number;
  saved: number;
  deadline: string; // YYYY-MM-DD
  icon: string;
  archived?: boolean;
  reachedAt?: string; // ISO date when goal was reached
}

const STORAGE_KEY = 'tracecash_savings_goals';

function loadGoals(): Goal[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveGoals(goals: Goal[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
}

const ICONS = ['🎯', '🏠', '🚗', '✈️', '💻', '📱', '🎓', '💍', '🏥', '🎁', '🛍️', '🏦'];

export default function SavingsGoals() {
  const [goals, setGoals] = useState<Goal[]>(loadGoals);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [saved, setSaved] = useState('');
  const [deadline, setDeadline] = useState('');
  const [icon, setIcon] = useState('🎯');
  const [addAmount, setAddAmount] = useState<{ id: string; amount: string } | null>(null);

  const openNew = () => {
    setEditId(null); setName(''); setTarget(''); setSaved('0'); setDeadline(''); setIcon('🎯');
    setShowModal(true);
  };

  const openEdit = (g: Goal) => {
    setEditId(g.id); setName(g.name); setTarget(String(g.target)); setSaved(String(g.saved)); setDeadline(g.deadline); setIcon(g.icon);
    setShowModal(true);
  };

  const handleSave = () => {
    if (!name.trim() || !target || Number(target) <= 0) return;
    const goal: Goal = {
      id: editId || Date.now().toString(),
      name: name.trim(), target: Number(target), saved: Number(saved) || 0,
      deadline, icon,
    };
    const updated = editId ? goals.map(g => g.id === editId ? goal : g) : [...goals, goal];
    setGoals(updated); saveGoals(updated);
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this goal?')) return;
    const updated = goals.filter(g => g.id !== id);
    setGoals(updated); saveGoals(updated);
  };

  const [celebration, setCelebration] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const handleAddToGoal = (id: string, amount: number) => {
    const goal = goals.find(g => g.id === id);
    const wasBelow = goal && goal.saved < goal.target;
    const updated = goals.map(g => {
      if (g.id !== id) return g;
      const newSaved = g.saved + amount;
      const justReached = wasBelow && newSaved >= g.target;
      return { ...g, saved: newSaved, reachedAt: justReached ? new Date().toISOString() : g.reachedAt };
    });
    setGoals(updated); saveGoals(updated);
    setAddAmount(null);
    // Celebration if just reached
    if (wasBelow && goal && (goal.saved + amount) >= goal.target) {
      setCelebration(goal.name);
      setTimeout(() => setCelebration(null), 4000);
    }
  };

  const handleArchive = (id: string) => {
    const updated = goals.map(g => g.id === id ? { ...g, archived: true } : g);
    setGoals(updated); saveGoals(updated);
  };

  const handleUnarchive = (id: string) => {
    const updated = goals.map(g => g.id === id ? { ...g, archived: false } : g);
    setGoals(updated); saveGoals(updated);
  };

  const handleReset = (id: string) => {
    if (!confirm('Reset saved amount to 0?')) return;
    const updated = goals.map(g => g.id === id ? { ...g, saved: 0, reachedAt: undefined } : g);
    setGoals(updated); saveGoals(updated);
  };

  const activeGoals = goals.filter(g => !g.archived);
  const archivedGoals = goals.filter(g => g.archived);

  if (activeGoals.length === 0 && archivedGoals.length === 0 && !showModal) {
    return (
      <button onClick={openNew} className="w-full p-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-2 border-dashed border-emerald-300 dark:border-emerald-700 rounded-xl text-emerald-600 dark:text-emerald-400 text-sm font-medium hover:border-emerald-400 transition-colors">
        🎯 Set a Savings Goal
      </button>
    );
  }

  const inputClass = "w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white";

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">🎯 Savings Goals</h2>
          <button onClick={openNew} className="text-[10px] text-emerald-500 font-medium">+ Add</button>
        </div>
        {/* Celebration banner */}
        {celebration && (
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl p-3 text-center animate-pulse">
            <p className="text-white text-lg font-bold">🎉 Goal Reached!</p>
            <p className="text-emerald-100 text-xs mt-0.5">Congratulations! You reached your "{celebration}" goal!</p>
          </div>
        )}

        {/* Active goals */}
        <div className="space-y-3">
          {activeGoals.length === 0 && <p className="text-xs text-gray-400 text-center py-2">No active goals</p>}
          {activeGoals.map(g => {
            const pct = g.target > 0 ? Math.round(g.saved / g.target * 100) : 0;
            const remaining = Math.max(g.target - g.saved, 0);
            const daysLeft = g.deadline ? Math.max(0, Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000)) : null;
            const reached = pct >= 100;
            return (
              <div key={g.id} className={`relative ${reached ? 'bg-emerald-50 dark:bg-emerald-900/10 rounded-lg p-2 -mx-2' : ''}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-lg">{g.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-900 dark:text-white truncate">{g.name}</span>
                      <span className={`text-[10px] font-bold ${reached ? 'text-emerald-500' : 'text-gray-500'}`}>{pct}%</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                      <span>{formatCurrency(g.saved)} / {formatCurrency(g.target)}</span>
                      {!reached && daysLeft !== null && daysLeft > 0 && <span>{daysLeft}d left</span>}
                      {reached && <span className="text-emerald-500 font-medium">🎉 Reached!</span>}
                    </div>
                  </div>
                </div>
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${reached ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {!reached && <button onClick={() => setAddAmount({ id: g.id, amount: '' })} className="text-[9px] px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-full font-medium">+ Add</button>}
                  {reached && <button onClick={() => handleArchive(g.id)} className="text-[9px] px-2 py-0.5 bg-emerald-500 text-white rounded-full font-medium">✓ Archive</button>}
                  {reached && <button onClick={() => handleReset(g.id)} className="text-[9px] px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-full font-medium">↺ Reset</button>}
                  <button onClick={() => openEdit(g)} className="text-[9px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded-full">Edit</button>
                  <button onClick={() => handleDelete(g.id)} className="text-[9px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded-full">Delete</button>
                </div>
                {addAmount?.id === g.id && (
                  <div className="flex gap-1.5 mt-1.5">
                    <AmountInput value={addAmount.amount} onChange={v => setAddAmount({ ...addAmount, amount: v })}
                      placeholder="Amount" className="flex-1 p-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs" />
                    <button onClick={() => { if (addAmount.amount) handleAddToGoal(g.id, Number(addAmount.amount)); }}
                      className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium">Save</button>
                    <button onClick={() => setAddAmount(null)} className="px-2 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-500 rounded-lg text-xs">✕</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Archived goals */}
        {archivedGoals.length > 0 && (
          <div className="mt-2">
            <button onClick={() => setShowArchived(!showArchived)}
              className="text-[10px] text-gray-400 flex items-center gap-1">
              <span className={`transition-transform ${showArchived ? 'rotate-90' : ''}`}>▶</span>
              {archivedGoals.length} completed goal{archivedGoals.length !== 1 ? 's' : ''}
            </button>
            {showArchived && (
              <div className="space-y-2 mt-1.5">
                {archivedGoals.map(g => (
                  <div key={g.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/30 rounded-lg opacity-60">
                    <span>{g.icon}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-gray-500 line-through truncate">{g.name}</span>
                      <span className="text-[10px] text-emerald-500 ml-1.5">{formatCurrency(g.target)} ✓</span>
                      {g.reachedAt && <span className="text-[9px] text-gray-400 ml-1">({new Date(g.reachedAt).toLocaleDateString()})</span>}
                    </div>
                    <button onClick={() => handleUnarchive(g.id)} className="text-[9px] text-blue-500 font-medium">Restore</button>
                    <button onClick={() => handleDelete(g.id)} className="text-[9px] text-gray-400">🗑️</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editId ? 'Edit Goal' : 'New Savings Goal'}>
        <div className="space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Goal name (e.g., New Laptop)" className={inputClass} />
          <AmountInput value={target} onChange={setTarget} placeholder="Target amount" className={inputClass} />
          <AmountInput value={saved} onChange={setSaved} placeholder="Already saved" className={inputClass} />
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={inputClass} />
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Icon</label>
            <div className="flex flex-wrap gap-1.5">
              {ICONS.map(i => (
                <button key={i} onClick={() => setIcon(i)} className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${icon === i ? 'ring-2 ring-emerald-500 bg-emerald-50 dark:bg-emerald-900/30' : 'bg-gray-50 dark:bg-gray-700'}`}>
                  {i}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleSave} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium">Save Goal</button>
        </div>
      </Modal>
    </>
  );
}
