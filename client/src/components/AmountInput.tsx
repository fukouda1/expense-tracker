import { formatAmountInput } from '../utils/formatters';

interface AmountInputProps {
  /** Raw numeric string the parent stores — e.g. "30000", "30000.5", "". */
  value: string;
  /** Receives the cleaned raw numeric string (no commas) — drop-in for setX. */
  onChange: (raw: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

/**
 * Amount input that shows thousand separators (30,000) while keeping the parent's
 * state a clean numeric string. A native <input type="number"> can't render commas,
 * so this is a text input with manual formatting.
 *
 * Clean rules: digits + a single "." only; strip everything else; collapse a
 * multi-digit leading-zero run ("007" -> "7") but keep "0" and "0.x".
 */
export default function AmountInput({
  value, onChange, placeholder, className, autoFocus, disabled, onFocus,
}: AmountInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^\d.]/g, '');     // keep digits + dots
    const firstDot = raw.indexOf('.');
    if (firstDot !== -1) {
      // collapse to a single dot
      raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
    }
    // strip leading zeros in the integer part ("007" -> "7"), but keep "0" / "0.x"
    const [intp, decp] = raw.split('.');
    let cleanInt = intp.replace(/^0+(?=\d)/, '');
    if (cleanInt === '' && raw !== '') cleanInt = '0';
    raw = raw.includes('.') ? `${cleanInt}.${decp ?? ''}` : cleanInt;
    onChange(raw);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={formatAmountInput(value)}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      autoFocus={autoFocus}
      disabled={disabled}
      onFocus={onFocus}
    />
  );
}
