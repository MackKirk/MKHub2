import { Eye, EyeOff } from 'lucide-react';
import { useId, useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
  helperText?: string;
  error?: string | null;
};

export default function PasswordField({
  label,
  helperText,
  error,
  className = '',
  id,
  ...rest
}: Props) {
  const autoId = useId();
  const inputId = id || autoId;
  const [show, setShow] = useState(false);

  return (
    <label className={`block text-sm ${className}`} htmlFor={inputId}>
      <span className="font-medium">{label}</span>
      <div className="relative mt-1">
        <input
          id={inputId}
          type={show ? 'text' : 'password'}
          minLength={rest.minLength ?? 8}
          className={`mk-input !mt-0 pr-10 ${error ? 'border-red-500 focus:ring-red-400/40' : ''}`}
          {...rest}
        />
        <button
          type="button"
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-sm text-metals-steel/55 hover:text-metals-ink"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : helperText ? (
        <span className="mt-1 block text-xs text-metals-steel/60">{helperText}</span>
      ) : null}
    </label>
  );
}
