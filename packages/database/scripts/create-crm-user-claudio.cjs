const path = require('path');
const { PrismaClient } = require('@prisma/client');

function loadBcrypt() {
  const candidates = [
    'bcrypt',
    path.resolve(__dirname, '../../../node_modules/bcrypt'),
    path.resolve(__dirname, '../../../apps/api/node_modules/bcrypt'),
  ];
  for (const id of candidates) {
    try {
      return require(id);
    } catch {
      /* try next */
    }
  }
  throw new Error('bcrypt não encontrado.');
}

const bcrypt = loadBcrypt();
const prisma = new PrismaClient();

const NAME = 'Claudio Pereira Gonçalves';
const EMAIL = 'claudio.pereiragoncalves6974@gmail.com';
const PASSWORD = 'Padrao123@';

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const role = await prisma.role.upsert({
    where: { name: 'OPERADOR' },
    update: {},
    create: {
      name: 'OPERADOR',
      description: 'Operador de expedição e estoque',
    },
  });

  const crmPermission = await prisma.permission.upsert({
    where: { module_action: { module: 'crm', action: 'ver_modulo' } },
    update: {},
    create: { module: 'crm', action: 'ver_modulo' },
  });

  const existing = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true },
  });

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: NAME,
          passwordHash,
          isActive: true,
        },
      })
    : await prisma.user.create({
        data: {
          name: NAME,
          email: EMAIL,
          passwordHash,
          defaultContext: 'WEG',
          isActive: true,
        },
      });

  await prisma.userRole.deleteMany({ where: { userId: user.id } });
  await prisma.userRole.create({
    data: { userId: user.id, roleId: role.id },
  });

  const allPermissions = await prisma.permission.findMany({
    select: { id: true, module: true, action: true },
    orderBy: [{ module: 'asc' }, { action: 'asc' }],
  });

  for (const permission of allPermissions) {
    const granted =
      permission.module === 'crm' && permission.action === 'ver_modulo';
    await prisma.userPermission.upsert({
      where: {
        userId_permissionId: {
          userId: user.id,
          permissionId: permission.id,
        },
      },
      create: {
        userId: user.id,
        permissionId: permission.id,
        granted,
      },
      update: { granted },
    });
  }

  // Garante o grant CRM mesmo se a tabela Permission ainda estiver vazia no boot.
  await prisma.userPermission.upsert({
    where: {
      userId_permissionId: {
        userId: user.id,
        permissionId: crmPermission.id,
      },
    },
    create: {
      userId: user.id,
      permissionId: crmPermission.id,
      granted: true,
    },
    update: { granted: true },
  });

  const grants = await prisma.userPermission.findMany({
    where: { userId: user.id, granted: true },
    include: { permission: { select: { module: true, action: true } } },
  });

  const navModules = [
    'dashboard',
    'expedicao',
    'estoque',
    'compras',
    'financeiro',
    'cadastros',
    'crm',
    'correios',
  ];
  const visibleNav = navModules.filter((module) =>
    grants.some(
      (g) => g.permission.module === module && g.permission.action === 'ver_modulo',
    ),
  );

  console.log(
    JSON.stringify(
      {
        created: !existing,
        updated: Boolean(existing),
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: 'OPERADOR',
          isActive: user.isActive,
        },
        granted: grants.map((g) => `${g.permission.module}:${g.permission.action}`),
        navModulesVisible: visibleNav,
        navModulesHidden: navModules.filter((m) => !visibleNav.includes(m)),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
