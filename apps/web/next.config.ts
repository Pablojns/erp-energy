import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Rotas /api/erp/* são atendidas por app/api/erp/[...segments]/route.ts,
  // que lê o cookie httpOnly e repassa Authorization ao Nest.
  // Não usar rewrites aqui — bypassam o proxy e causam 401 em produção.

  // Permite acessar o dev server via IP da rede local (ex.: para testar em
  // outro PC/celular). Sem isso, o Next bloqueia com 403 os assets internos
  // (/_next/static/*, HMR) quando o Origin não é "localhost", e a página
  // carrega só o HTML estático (sem hidratar / sem interatividade).
  allowedDevOrigins: ["192.168.0.7", "192.168.0.11"],
};

export default nextConfig;