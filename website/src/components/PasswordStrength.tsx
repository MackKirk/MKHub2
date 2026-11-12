function scorePassword(password: string): number {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

function labelFor(score: number): { text: string; bar: string; width: string } {
  if (score <= 1) return { text: 'Weak', bar: 'bg-red-500', width: 'w-1/3' };
  if (score <= 3) return { text: 'Fair', bar: 'bg-amber-500', width: 'w-2/3' };
  return { text: 'Strong', bar: 'bg-emerald-600', width: 'w-full' };
}

export default function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const { text, bar, width } = labelFor(scorePassword(password));
  return (
    <div className="mt-2" aria-live="polite">
      <div className="h-1.5 w-full overflow-hidden rounded-sm bg-metals-mist">
        <div className={`h-full transition-all duration-200 ${bar} ${width}`} />
      </div>
      <p className="mt-1 text-xs text-metals-steel/65">
        Strength: <span className="font-medium text-metals-ink">{text}</span>
      </p>
    </div>
  );
}
