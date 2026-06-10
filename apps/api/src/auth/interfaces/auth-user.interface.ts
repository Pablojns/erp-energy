export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  roles: string[];
}
