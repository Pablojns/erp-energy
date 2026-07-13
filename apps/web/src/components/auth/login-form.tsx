'use client';

import { Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';
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
      <div className="rounded-xl bg-[linear-gradient(to_right,#2AACE2,#5BBFB0)] p-[1px]">
        <div className="flex items-center justify-center rounded-[11px] bg-white px-4 py-4">
          <Image
            src="/brand/energy-brands-logo.png"
            alt="Energy Brands"
            width={260}
            height={68}
            priority
            className="h-12 w-auto object-contain"
          />
        </div>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-erp-fg">Entrar no ERP</h1>
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
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="erp-login-cta erp-focus-ring w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}
