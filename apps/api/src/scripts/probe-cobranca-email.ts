/**
 * Probe cobrança: preview + envio de teste (requer RESEND_API_KEY + EMAIL_FROM).
 *   cd apps/api
 *   npx ts-node -r tsconfig-paths/register src/scripts/probe-cobranca-email.ts
 *
 * Env opcional: COBRANCA_TEST_TO=seu@email.com
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@erp/database';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../quotes/mail.service';
import { R2StorageService } from '../storage/r2-storage.service';
import { InterIntegrationService } from '../financeiro/inter-integration.service';
import { NotasAbertasService } from '../financeiro/notas-abertas.service';

function loadEnvFile(): void {
  for (const envPath of [
    resolve(__dirname, '../../../.env'),
    resolve(__dirname, '../../.env'),
  ]) {
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

async function main() {
  loadEnvFile();
  const config = new ConfigService();
  const resendKey = config.get<string>('RESEND_API_KEY')?.trim();
  const emailFrom = config.get<string>('EMAIL_FROM')?.trim();
  console.log('Resend configured:', Boolean(resendKey && emailFrom), {
    from: emailFrom || null,
    hasApiKey: Boolean(resendKey),
  });

  const prismaSvc = new PrismaService();
  const mail = new MailService(config);
  const storage = new R2StorageService(config);
  const inter = new InterIntegrationService(prismaSvc, config);
  const notas = new NotasAbertasService(prismaSvc, inter, mail, storage);

  const list = await notas.list({ includeLegado: false });
  const withXml = list.data.find((r) => r.orderId);
  if (!withXml) {
    console.log('Nenhuma nota com pedido para testar.');
    await prisma.$disconnect();
    return;
  }

  console.log('Usando NF', withXml.invoiceDigits, 'pedido', withXml.pedido);
  const preview = await notas.previewCobranca([withXml.invoiceDigits]);
  console.log({
    emailSugerido: preview.emailSugerido,
    assunto: preview.assunto,
    anexos: preview.anexosDisponiveis,
  });

  const to = process.env.COBRANCA_TEST_TO?.trim();
  if (!resendKey || !emailFrom) {
    console.log(
      'SKIP envio real: preencha RESEND_API_KEY e EMAIL_FROM no .env e rode de novo com COBRANCA_TEST_TO.',
    );
    await prisma.$disconnect();
    return;
  }
  if (!to) {
    console.log('SKIP: defina COBRANCA_TEST_TO.');
    await prisma.$disconnect();
    return;
  }

  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) throw new Error('Sem usuário no banco para auditoria.');

  const result = await notas.enviarCobranca({
    invoiceDigits: [withXml.invoiceDigits],
    to,
    assunto: `[TESTE ERP] ${preview.assunto}`,
    corpo: preview.corpo + '\n\n(Este é um e-mail de teste do ERP via Resend.)',
    userId: user.id,
  });
  console.log('Enviado:', result);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
