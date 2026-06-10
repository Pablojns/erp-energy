# ERP Energy Monorepo Foundation

Fundacao inicial de ERP escalavel em monorepo, sem modulos de negocio implementados.

## Stack

- Frontend: Next.js (App Router + TypeScript + Tailwind)
- Backend: NestJS (TypeScript)
- Banco: PostgreSQL
- ORM: Prisma
- Cache/Fila: Redis + BullMQ
- Futuro: Supabase Realtime, Cloudflare R2, Sentry
- Sem Firebase

## Estrutura

```txt
.
├─ apps/
│  ├─ web/        # Next.js
│  └─ api/        # NestJS
└─ packages/
   ├─ database/   # Prisma + client compartilhado
   └─ shared/     # tipos e validacoes compartilhadas
```

## Prerequisitos

- Node.js 22+
- Corepack habilitado
- Docker (opcional, para Postgres/Redis locais)

## Instalacao

```bash
corepack pnpm install
```

## Servicos locais (Docker Compose)

Suba PostgreSQL e Redis para desenvolvimento local:

```bash
docker compose up -d
```

Parar os servicos:

```bash
docker compose down
```

Ver logs:

```bash
docker compose logs -f
```

Configuracao aplicada no `docker-compose.yml`:

- PostgreSQL `erp_dev` em `localhost:5432`
- Usuario: `erp_user`
- Senha: `erp_password`
- Redis em `localhost:6379`
- Volume persistente: `postgres_data`

## Variaveis de ambiente

Copie os exemplos para os ambientes locais:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp packages/database/.env.example packages/database/.env
```

> No Windows PowerShell, use `Copy-Item` no lugar de `cp`.

## Scripts principais

No diretorio raiz:

```bash
corepack pnpm dev
corepack pnpm build
corepack pnpm lint
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm db:studio
```

## Execucao local

1. Suba Postgres e Redis com Docker Compose.
2. Execute migracoes Prisma.
3. Rode web + api em paralelo.

```bash
docker compose up -d
corepack pnpm db:migrate
corepack pnpm dev
```

### Portas padrao

- Web: http://localhost:3000
- API: http://localhost:3001

## Observacoes

- Esta base prepara padroes de workspace, banco e compartilhamento de contratos.
- Nao ha modulos de ERP implementados nesta etapa.
