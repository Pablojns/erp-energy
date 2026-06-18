'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type LoginInput = {
  email: string;
  password: string;
};

export function useLogin() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onSubmit = (input: LoginInput) => {
    setErrorMessage(null);

    startTransition(async () => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        setErrorMessage(payload.message ?? 'Email ou senha incorretos.');
        return;
      }

      router.replace('/app');
      router.refresh();
    });
  };

  return {
    onSubmit,
    isPending,
    errorMessage,
  };
}
