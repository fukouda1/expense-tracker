import { useState } from 'react';
import { formatCurrency } from '../utils/formatters';
import Modal from './Modal';

interface Goal {
  id: string;
  name: string;
  target: number;
  saved: number;
  deadline: string; // YYYY-MM-DD
  icon: string;
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

  const handleAddToGoal = (id: string, amount: number) => {
    const updated = goals.map(g => g.id === id ? { ...g, saved: Math.min(g.saved + amount, g.target) } : g);
    setGoals(updated); saveGoals(updated);
    setAddAmount(null);
  };

  if (goals.length === 0 && !showModal) {
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
        <div className="space-y-3">
          {goals.map(g => {
            const pct = Math.min(Math.round(g.saved / g.target * 100), 100);
            const remaining = Math.max(g.target - g.saved, 0);
            const daysLeft = g.deadline ? Math.max(0, Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000)) : null;
            return (
              <div key={g.id} className="relative">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-lg">{g.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-900 dark:text-white truncate">{g.name}</span>
                      <span className={`text-[10px] font-bold ${pct >= 100 ? 'text-emerald-500' : 'text-gray-500'}`}>{pct}%</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                      <span>{formatCurrency(g.saved)} / {formatCurrency(g.target)}</span>
                      {daysLeft !== null && daysLeft > 0 && <span>{daysLeft}d left</span>}
                      {pct >= 100 && <span className="text-emerald-500 font-medium">Reached!</span>}
                    </div>
                  </div>
                </div>
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-blue-500'}`}
                    style={{ width: `${pct}%` }} />
                </div>
                <div className="flex gap-1 mt-1.5">
                  <button onClick={() => setAddAmount({ id: g.id, amount: '' })} className="text-[9px] px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-full font-medium">+ Add</button>
                  <button onClick={() => openEdit(g)} className="text-[9px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded-full">Edit</button>
                  <button onClick={() => handleDelete(g.id)} className="text-[9px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded-full">Delete</button>
                </div>
                {addAmount?.id === g.id && (
                  <div className="flex gap-1.5 mt-1.5">
                    <input type="number" value={addAmount.amount} onChange={e => setAddAmount({ ...addAmount, amount: e.target.value })}
                      placeholder="Amount" className="flex-1 p-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs" inputMode="decimal" />
                    <button onClick={() => { if (addAmount.amount) handleAddToGoal(g.id, Number(addAmount.amount)); }}
                      className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium">Save</button>
                    <button onClick={() => setAddAmount(null)} className="px-2 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-500 rounded-lg text-xs">✕</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editId ? 'Edit Goal' : 'New Savings Goal'}>
        <div className="space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Goal name (e.g., New Laptop)" className={inputClass} />
          <input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="Target amount" className={inputClass} inputMode="decimal" />
          <input type="number" value={saved} onChange={e => setSaved(e.target.value)} placeholder="Already saved" className={inputClass} inputMode="decimal" />
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
