'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

type LogoutButtonProps = {
  variant?: 'default' | 'icon';
};

export function LogoutButton({ variant = 'default' }: LogoutButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleLogout = () => {
    startTransition(async () => {
      await fetch('/api/auth/logout', {
        method: 'POST',
      });
      router.replace('/login');
      router.refresh();
    });
  };

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleLogout}
        disabled={isPending}
        className="erp-icon-btn erp-focus-ring flex h-10 w-10 items-center justify-center text-erp-fg-muted transition hover:border-rose-400/35 hover:bg-rose-500/10 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:text-rose-200"
        aria-label={isPending ? 'Saindo' : 'Sair'}
      >
        <LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isPending}
      className="rounded-xl border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-sm font-medium text-zinc-200 transition hover:border-rose-400/35 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? 'Saindo...' : 'Sair'}
    </button>
  );
}
