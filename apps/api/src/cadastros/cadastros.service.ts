import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCustomerDto } from './dto/create-customer.dto';
import type { CreateNameCadastroDto } from './dto/create-name-cadastro.dto';
import type { CreateSupplierDto } from './dto/create-supplier.dto';
import type { UpdateCustomerDto } from './dto/update-customer.dto';
import type { UpdateNameCadastroDto } from './dto/update-name-cadastro.dto';
import type { UpdateSupplierDto } from './dto/update-supplier.dto';

type NameRecord = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type SupplierRecord = NameRecord & { document: string | null };

type CustomerRecord = NameRecord & {
  document: string | null;
  deliveryAddress: string | null;
};

@Injectable()
export class CadastrosService {
  constructor(private readonly prisma: PrismaService) {}

  private serializeName(row: NameRecord) {
    return {
      id: row.id,
      name: row.name,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private serializeSupplier(row: SupplierRecord) {
    return {
      ...this.serializeName(row),
      cnpj: row.document,
    };
  }

  private serializeCustomer(row: CustomerRecord) {
    return {
      ...this.serializeName(row),
      cnpj: row.document,
      deliveryAddress: row.deliveryAddress,
    };
  }

  private trimOptional(value?: string | null) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  // --- Receivers ---

  listReceivers() {
    return this.prisma.client.receiver
      .findMany({ orderBy: [{ name: 'asc' }] })
      .then((rows) => rows.map((row) => this.serializeName(row)));
  }

  createReceiver(dto: CreateNameCadastroDto) {
    return this.prisma.client.receiver
      .create({ data: { name: dto.name.trim() } })
      .then((row) => this.serializeName(row));
  }

  async updateReceiver(id: string, dto: UpdateNameCadastroDto) {
    await this.assertReceiverExists(id);
    const data: { name?: string } = {};
    if (dto.name?.trim()) data.name = dto.name.trim();
    const updated = await this.prisma.client.receiver.update({
      where: { id },
      data,
    });
    return this.serializeName(updated);
  }

  async toggleReceiver(id: string) {
    const row = await this.assertReceiverExists(id);
    const updated = await this.prisma.client.receiver.update({
      where: { id },
      data: { isActive: !row.isActive },
    });
    return this.serializeName(updated);
  }

  private async assertReceiverExists(id: string) {
    const row = await this.prisma.client.receiver.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Recebedor não encontrado.');
    return row;
  }

  // --- Unloading points ---

  listUnloadingPoints() {
    return this.prisma.client.unloadingPoint
      .findMany({ orderBy: [{ name: 'asc' }] })
      .then((rows) => rows.map((row) => this.serializeName(row)));
  }

  createUnloadingPoint(dto: CreateNameCadastroDto) {
    return this.prisma.client.unloadingPoint
      .create({ data: { name: dto.name.trim() } })
      .then((row) => this.serializeName(row));
  }

  async updateUnloadingPoint(id: string, dto: UpdateNameCadastroDto) {
    await this.assertUnloadingPointExists(id);
    const data: { name?: string } = {};
    if (dto.name?.trim()) data.name = dto.name.trim();
    const updated = await this.prisma.client.unloadingPoint.update({
      where: { id },
      data,
    });
    return this.serializeName(updated);
  }

  async toggleUnloadingPoint(id: string) {
    const row = await this.assertUnloadingPointExists(id);
    const updated = await this.prisma.client.unloadingPoint.update({
      where: { id },
      data: { isActive: !row.isActive },
    });
    return this.serializeName(updated);
  }

  private async assertUnloadingPointExists(id: string) {
    const row = await this.prisma.client.unloadingPoint.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Ponto de descarga não encontrado.');
    return row;
  }

  // --- Carriers ---

  listCarriers() {
    return this.prisma.client.carrier
      .findMany({ orderBy: [{ name: 'asc' }] })
      .then((rows) => rows.map((row) => this.serializeName(row)));
  }

  createCarrier(dto: CreateNameCadastroDto) {
    return this.prisma.client.carrier
      .create({ data: { name: dto.name.trim() } })
      .then((row) => this.serializeName(row));
  }

  async updateCarrier(id: string, dto: UpdateNameCadastroDto) {
    await this.assertCarrierExists(id);
    const data: { name?: string } = {};
    if (dto.name?.trim()) data.name = dto.name.trim();
    const updated = await this.prisma.client.carrier.update({
      where: { id },
      data,
    });
    return this.serializeName(updated);
  }

  async toggleCarrier(id: string) {
    const row = await this.assertCarrierExists(id);
    const updated = await this.prisma.client.carrier.update({
      where: { id },
      data: { isActive: !row.isActive },
    });
    return this.serializeName(updated);
  }

  private async assertCarrierExists(id: string) {
    const row = await this.prisma.client.carrier.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Transportadora não encontrada.');
    return row;
  }

  // --- Suppliers ---

  listSuppliers() {
    return this.prisma.client.supplier
      .findMany({ orderBy: [{ name: 'asc' }] })
      .then((rows) => rows.map((row) => this.serializeSupplier(row)));
  }

  createSupplier(dto: CreateSupplierDto) {
    return this.prisma.client.supplier
      .create({
        data: {
          name: dto.name.trim(),
          document: this.trimOptional(dto.cnpj) ?? null,
        },
      })
      .then((row) => this.serializeSupplier(row));
  }

  async updateSupplier(id: string, dto: UpdateSupplierDto) {
    await this.assertSupplierExists(id);
    const data: { name?: string; document?: string | null } = {};
    if (dto.name?.trim()) data.name = dto.name.trim();
    if (dto.cnpj !== undefined) {
      data.document = this.trimOptional(dto.cnpj) ?? null;
    }
    const updated = await this.prisma.client.supplier.update({
      where: { id },
      data,
    });
    return this.serializeSupplier(updated);
  }

  async toggleSupplier(id: string) {
    const row = await this.assertSupplierExists(id);
    const updated = await this.prisma.client.supplier.update({
      where: { id },
      data: { isActive: !row.isActive },
    });
    return this.serializeSupplier(updated);
  }

  private async assertSupplierExists(id: string) {
    const row = await this.prisma.client.supplier.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Fornecedor não encontrado.');
    return row;
  }

  // --- Customers ---

  listCustomers() {
    return this.prisma.client.customer
      .findMany({ orderBy: [{ name: 'asc' }] })
      .then((rows) => rows.map((row) => this.serializeCustomer(row)));
  }

  createCustomer(dto: CreateCustomerDto) {
    return this.prisma.client.customer
      .create({
        data: {
          name: dto.name.trim(),
          document: this.trimOptional(dto.cnpj) ?? null,
          email: this.trimOptional(dto.email) ?? null,
          phone: this.trimOptional(dto.phone) ?? null,
          deliveryAddress: this.trimOptional(dto.deliveryAddress) ?? null,
        },
      })
      .then((row) => this.serializeCustomer(row));
  }

  async updateCustomer(id: string, dto: UpdateCustomerDto) {
    await this.assertCustomerExists(id);
    const data: {
      name?: string;
      document?: string | null;
      deliveryAddress?: string | null;
    } = {};
    if (dto.name?.trim()) data.name = dto.name.trim();
    if (dto.cnpj !== undefined) {
      data.document = this.trimOptional(dto.cnpj) ?? null;
    }
    if (dto.deliveryAddress !== undefined) {
      data.deliveryAddress = this.trimOptional(dto.deliveryAddress) ?? null;
    }
    const updated = await this.prisma.client.customer.update({
      where: { id },
      data,
    });
    return this.serializeCustomer(updated);
  }

  async toggleCustomer(id: string) {
    const row = await this.assertCustomerExists(id);
    const updated = await this.prisma.client.customer.update({
      where: { id },
      data: { isActive: !row.isActive },
    });
    return this.serializeCustomer(updated);
  }

  private async assertCustomerExists(id: string) {
    const row = await this.prisma.client.customer.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Cliente não encontrado.');
    return row;
  }
}
