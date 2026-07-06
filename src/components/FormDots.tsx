import type { FormResult } from '../types';

interface Props {
  form: FormResult[];
  size?: 'sm' | 'md';
}

export default function FormDots({ form, size = 'md' }: Props) {
  return (
    <div className="flex gap-1 items-center">
      {form.map((r, i) => (
        <div
          key={i}
          className="rounded-full font-bold flex items-center justify-center font-num"
          style={{
            width: size === 'sm' ? 16 : 20,
            height: size === 'sm' ? 16 : 20,
            fontSize: size === 'sm' ? 9 : 10,
            background: r === 'W' ? 'rgba(18,161,80,0.15)' : 'rgba(229,71,43,0.15)',
            color: r === 'W' ? '#12A150' : '#E5472B',
            border: `1px solid ${r === 'W' ? 'rgba(18,161,80,0.3)' : 'rgba(229,71,43,0.3)'}`,
          }}
        >
          {r}
        </div>
      ))}
    </div>
  );
}
