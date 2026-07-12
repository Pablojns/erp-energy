import type { ReactNode } from 'react';
import { BottomNavigation } from '@/src/components/shell/bottom-navigation';
import { GlobalSearchProvider } from '@/src/components/shell/global-search-provider';
import { TopNavigation } from '@/src/components/shell/top-navigation';
import type { AuthUser } from '@/src/services/api/auth';

type AppShellProps = {
  user: AuthUser;
  children: ReactNode;
};

export function AppShell({ user, children }: AppShellProps) {
  return (
    <GlobalSearchProvider>
      <div className="erp-app-bg relative min-h-screen-safe w-full">
        <div className="erp-app-vignette" aria-hidden />
        <TopNavigation user={user} />
        <main className="relative mx-auto w-full max-w-[1600px] px-2 pb-[84px] pt-[96px] sm:px-4 sm:pt-[108px] lg:px-8 lg:pb-16 lg:pt-[116px]">
          {children}
        </main>
        <BottomNavigation />
      </div>
    </GlobalSearchProvider>
  );
}
