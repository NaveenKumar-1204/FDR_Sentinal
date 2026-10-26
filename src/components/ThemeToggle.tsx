import { Moon, Sun } from 'lucide-react';
import { useSession } from '../session';
import { cx } from './ui';

export default function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useSession();
  const dark = resolvedTheme === 'dark';
  return (
    <button type="button" onClick={toggleTheme} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title={dark ? 'Light theme' : 'Dark theme'}
      className={cx('grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface text-ink-2 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:text-ink active:scale-95', className)}>
      <span key={resolvedTheme} className="spin-in">
        {dark ? <Sun size={18} className="text-amber" /> : <Moon size={18} className="text-violet" />}
      </span>
    </button>
  );
}
