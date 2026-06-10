'use client';

import { FormEvent, useState } from 'react';
import { useLogin } from '@/src/hooks/use-login';

export function LoginForm() {
  const { onSubmit, isPending, errorMessage } = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({ email, password });
  };

  return (
    <form
      className="erp-login-card w-full max-w-md space-y-4 rounded-xl p-6"
      onSubmit={handleSubmit}
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-erp-fg">Entrar no ERP</h1>
        <p className="text-sm text-erp-fg-muted">
          Use suas credenciais para acessar o sistema.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-erp-fg-secondary" htmlFor="email">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="admin@erp.local"
          className="erp-input w-full rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-erp-fg-secondary" htmlFor="password">
          Senha
        </label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          className="erp-input w-full rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {errorMessage ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-200">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="erp-btn-primary erp-focus-ring w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}
