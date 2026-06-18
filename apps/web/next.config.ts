import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Rotas /api/erp/* são atendidas por app/api/erp/[...segments]/route.ts,
  // que lê o cookie httpOnly e repassa Authorization ao Nest.
  // Não usar rewrites aqui — bypassam o proxy e causam 401 em produção.
};

export default nextConfig;