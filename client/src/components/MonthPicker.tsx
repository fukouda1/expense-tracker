// iOS-compatible month picker (type="month" is unsupported on iOS Safari)
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface Props {
  value: string; // "YYYY-MM"
  onChange: (v: string) => void;
  className?: string;
}

export default function MonthPicker({ value, onChange, className }: Props) {
  const [yearStr, monthStr] = value.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-12

  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear - 3; y <= currentYear + 2; y++) years.push(y);

  const setMonth = (m: number) => onChange(`${year}-${String(m).padStart(2, '0')}`);
  const setYear = (y: number) => onChange(`${y}-${String(month).padStart(2, '0')}`);

  return (
    <div className="flex gap-2">
      <select
        value={month}
        onChange={e => setMonth(Number(e.target.value))}
        className={className}
      >
        {MONTHS.map((m, i) => (
          <option key={i + 1} value={i + 1}>{m}</option>
        ))}
      </select>
      <select
        value={year}
        onChange={e => setYear(Number(e.target.value))}
        className={className}
      >
        {years.map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}
