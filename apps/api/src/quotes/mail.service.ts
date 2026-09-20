import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export type SendMailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: SendMailAttachment[];
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private client: Resend | null = null;

  constructor(private readonly config: ConfigService) {}

  private getClient(): Resend {
    if (this.client) return this.client;

    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'RESEND_API_KEY não configurada — envio de e-mail indisponível.',
      );
    }

    this.client = new Resend(apiKey);
    return this.client;
  }

  private resolveFrom(): string {
    const from = this.config.get<string>('EMAIL_FROM')?.trim();
    if (!from) {
      throw new ServiceUnavailableException(
        'EMAIL_FROM não configurada — envio de e-mail indisponível.',
      );
    }
    return from;
  }

  async sendMail(input: SendMailInput): Promise<{ messageId: string }> {
    const from = this.resolveFrom();
    const client = this.getClient();

    const { data, error } = await client.emails.send({
      from: `Energy Brands <${from}>`,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments?.map((att) => ({
        filename: att.filename,
        content: att.content.toString('base64'),
        contentType: att.contentType,
      })),
    });

    if (error) {
      this.logger.error(
        `Falha ao enviar e-mail para ${input.to}: ${error.message}`,
      );
      throw new ServiceUnavailableException(
        `Falha no envio de e-mail via Resend: ${error.message}`,
      );
    }

    const messageId = String(data?.id ?? '');
    this.logger.log(`E-mail enviado para ${input.to} (id=${messageId})`);
    return { messageId };
  }
}
