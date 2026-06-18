export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  tokenVersion: number;
}
