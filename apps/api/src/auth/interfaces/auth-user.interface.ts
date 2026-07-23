export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  roles: string[];
  department?: string | null;
  /** WEG | SITE — padrão ao logar (seletor pode sobrescrever na sessão). */
  defaultContext?: string | null;
}
