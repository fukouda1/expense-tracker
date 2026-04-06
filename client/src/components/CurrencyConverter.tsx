import { useState } from 'react';
import Modal from './Modal';

// Common rates relative to PHP (approximate)
const RATES: Record<string, { name: string; rate: number; symbol: string }> = {
  USD: { name: 'US Dollar', rate: 56.5, symbol: '$' },
  EUR: { name: 'Euro', rate: 62.0, symbol: '€' },
  GBP: { name: 'British Pound', rate: 72.0, symbol: '£' },
  JPY: { name: 'Japanese Yen', rate: 0.38, symbol: '¥' },
  KRW: { name: 'Korean Won', rate: 0.042, symbol: '₩' },
  CNY: { name: 'Chinese Yuan', rate: 7.8, symbol: '¥' },
  SGD: { name: 'Singapore Dollar', rate: 42.5, symbol: 'S$' },
  HKD: { name: 'Hong Kong Dollar', rate: 7.3, symbol: 'HK$' },
  AUD: { name: 'Australian Dollar', rate: 37.0, symbol: 'A$' },
  CAD: { name: 'Canadian Dollar', rate: 41.0, symbol: 'C$' },
  AED: { name: 'UAE Dirham', rate: 15.4, symbol: 'د.إ' },
  SAR: { name: 'Saudi Riyal', rate: 15.1, symbol: '﷼' },
  THB: { name: 'Thai Baht', rate: 1.65, symbol: '฿' },
  MYR: { name: 'Malaysian Ringgit', rate: 12.8, symbol: 'RM' },
  IDR: { name: 'Indonesian Rupiah', rate: 0.0035, symbol: 'Rp' },
  VND: { name: 'Vietnamese Dong', rate: 0.0022, symbol: '₫' },
  INR: { name: 'Indian Rupee', rate: 0.67, symbol: '₹' },
  TWD: { name: 'Taiwan Dollar', rate: 1.75, symbol: 'NT$' },
};

interface Props {
  open: boolean;
  onClose: () => void;
  onConvert: (phpAmount: number) => void;
}

export default function CurrencyConverter({ open, onClose, onConvert }: Props) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');

  const rate = RATES[currency]?.rate ?? 1;
  const phpAmount = Number(amount) * rate;

  return (
    <Modal open={open} onClose={onClose} title="💱 Currency Converter">
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Foreign Currency</label>
          <select value={currency} onChange={e => setCurrency(e.target.value)}
            className="w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white">
            {Object.entries(RATES).map(([code, { name, symbol }]) => (
              <option key={code} value={code}>{symbol} {code} — {name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Amount in {currency}</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{RATES[currency]?.symbol}</span>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0.00" inputMode="decimal"
              className="w-full pl-10 pr-4 p-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-lg font-bold text-gray-900 dark:text-white" />
          </div>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase mb-1">Converted Amount</p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">₱{phpAmount.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-[9px] text-gray-400 mt-1">Rate: 1 {currency} = ₱{rate.toFixed(2)} (approximate)</p>
        </div>
        <button
          onClick={() => { if (phpAmount > 0) { onConvert(Math.round(phpAmount * 100) / 100); onClose(); } }}
          disabled={!amount || phpAmount <= 0}
          className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium disabled:opacity-40"
        >
          Use ₱{phpAmount > 0 ? phpAmount.toLocaleString('en', { minimumFractionDigits: 2 }) : '0.00'} as Amount
        </button>
        <p className="text-[9px] text-gray-400 text-center">Rates are approximate. For exact rates, check your bank.</p>
      </div>
    </Modal>
  );
}
