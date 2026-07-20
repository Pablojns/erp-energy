import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'stream';

@Injectable()
export class R2StorageService {
  private client: S3Client;
  private bucket: string;

  constructor(private config: ConfigService) {
    this.bucket = config.get('R2_BUCKET_NAME') ?? '';
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.get('R2_ENDPOINT'),
      credentials: {
        accessKeyId: config.get('R2_ACCESS_KEY_ID') ?? '',
        secretAccessKey: config.get('R2_SECRET_ACCESS_KEY') ?? '',
      },
    });
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    return key;
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn },
    );
  }

  async getObject(key: string): Promise<{
    body: Readable;
    contentType: string;
    contentLength?: number;
  }> {
    const buffered = await this.getObjectBuffer(key);
    const { Readable } = await import('stream');
    return {
      body: Readable.from(buffered.buffer),
      contentType: buffered.contentType,
      contentLength: buffered.buffer.length,
    };
  }

  /** Lê o objeto inteiro em Buffer — evita streams SdkStream incompatíveis com Nest StreamableFile. */
  async getObjectBuffer(key: string): Promise<{
    buffer: Buffer;
    contentType: string;
  }> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error('Arquivo vazio no storage.');
    }

    const bytes = await response.Body.transformToByteArray();
    return {
      buffer: Buffer.from(bytes),
      contentType: response.ContentType ?? 'application/octet-stream',
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}
