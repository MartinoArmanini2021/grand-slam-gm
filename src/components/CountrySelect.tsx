import { COUNTRIES } from '../data/countries';

// A styled native <select> for choosing a country — native pickers are the best mobile
// UX for a long list. Value stored is the country name (matches the profile field).
// Reuse this everywhere a country is asked for.
export default function CountrySelect({ value, onChange, ariaLabel = 'Country', id }: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
  id?: string;
}) {
  const field = { background: 'var(--raised)', border: '1px solid rgba(10,27,51,0.12)', color: 'var(--ink)' } as const;
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="w-full text-sm pl-3 pr-8 py-2.5 rounded-xl appearance-none cursor-pointer"
        style={{ ...field, color: value ? 'var(--ink)' : 'var(--ink-3)' }}
      >
        <option value="">Select country…</option>
        {COUNTRIES.map(c => (
          <option key={c.code} value={c.name}>{c.flag} {c.name}</option>
        ))}
      </select>
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none" style={{ color: 'var(--ink-3)' }}>▾</span>
    </div>
  );
}
