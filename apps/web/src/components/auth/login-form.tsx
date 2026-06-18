'use client';

import { Eye, EyeOff } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useLogin } from '@/src/hooks/use-login';

export function LoginForm() {
  const { onSubmit, isPending, errorMessage } = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            className="erp-input w-full rounded-lg px-3 py-2 pr-10 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="erp-focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-erp-fg-muted transition hover:text-erp-fg"
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden />
            ) : (
              <Eye className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
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
