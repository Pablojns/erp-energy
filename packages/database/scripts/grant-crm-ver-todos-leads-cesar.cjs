const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const CLAUDIO_EMAIL = 'claudio.pereiragoncalves6974@gmail.com';

function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

async function main() {
  const permission = await prisma.permission.upsert({
    where: { module_action: { module: 'crm', action: 'ver_todos_leads' } },
    update: {
      description:
        'Sem esta permissão, o usuário vê apenas os leads em que é o responsável.',
    },
    create: {
      module: 'crm',
      action: 'ver_todos_leads',
      description:
        'Sem esta permissão, o usuário vê apenas os leads em que é o responsável.',
    },
  });

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      userRoles: { include: { role: { select: { name: true } } } },
    },
    orderBy: { name: 'asc' },
  });

  const cesarUsers = users.filter((user) => {
    const name = normalize(user.name);
    const email = normalize(user.email);
    return name.includes('cesar') || email.includes('cesar');
  });
  const claudio = users.find(
    (user) => user.email.toLowerCase() === CLAUDIO_EMAIL,
  );

  if (cesarUsers.length === 0) {
    console.warn(
      'Nenhum usuário César encontrado neste banco. Permissão criada; conceda manualmente quando o usuário existir.',
    );
  }

  const granted = [];
  for (const user of cesarUsers) {
    const isAdmin = user.userRoles.some((r) => r.role.name === 'ADMIN');
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
        granted: true,
      },
      update: { granted: true },
    });
    granted.push({
      id: user.id,
      name: user.name,
      email: user.email,
      roles: user.userRoles.map((r) => r.role.name),
      adminBypass: isAdmin,
      granted: true,
    });
  }

  let claudioGrant = null;
  if (claudio) {
    await prisma.userPermission.upsert({
      where: {
        userId_permissionId: {
          userId: claudio.id,
          permissionId: permission.id,
        },
      },
      create: {
        userId: claudio.id,
        permissionId: permission.id,
        granted: false,
      },
      update: { granted: false },
    });
    claudioGrant = {
      id: claudio.id,
      name: claudio.name,
      email: claudio.email,
      granted: false,
    };
  }

  console.log(
    JSON.stringify(
      {
        permission: `${permission.module}:${permission.action}`,
        cesar: granted,
        claudio: claudioGrant,
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
