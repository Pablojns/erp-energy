import { redirect } from 'next/navigation';
import { LoginForm } from '@/src/components/auth/login-form';
import { isAuthDisabled } from '@/src/services/auth/bypass';

export default function LoginPage() {
  if (isAuthDisabled()) {
    redirect('/app');
  }

  return (
    <main className="erp-login-page flex min-h-screen items-center justify-center p-6">
      <LoginForm />
    </main>
  );
}
