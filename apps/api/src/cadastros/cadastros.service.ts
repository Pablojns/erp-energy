import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@erp/database';
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

  private async safeDelete(
    deleteFn: () => Promise<unknown>,
    inUseMessage: string,
  ) {
    try {
      await deleteFn();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2003' || error.code === 'P2014')
      ) {
        throw new BadRequestException(inUseMessage);
      }
      throw error;
    }
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

  async deleteReceiver(id: string) {
    await this.assertReceiverExists(id);
    await this.safeDelete(
      () => this.prisma.client.receiver.delete({ where: { id } }),
      'Não é possível excluir: recebedor em uso.',
    );
    return { ok: true as const };
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

  async deleteUnloadingPoint(id: string) {
    await this.assertUnloadingPointExists(id);
    await this.safeDelete(
      () => this.prisma.client.unloadingPoint.delete({ where: { id } }),
      'Não é possível excluir: ponto de descarga em uso.',
    );
    return { ok: true as const };
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

  async deleteCarrier(id: string) {
    await this.assertCarrierExists(id);
    await this.safeDelete(
      () => this.prisma.client.carrier.delete({ where: { id } }),
      'Não é possível excluir: transportadora vinculada a pedidos.',
    );
    return { ok: true as const };
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

  async deleteSupplier(id: string) {
    await this.assertSupplierExists(id);
    await this.safeDelete(
      () => this.prisma.client.supplier.delete({ where: { id } }),
      'Não é possível excluir: fornecedor vinculado a contas ou produtos.',
    );
    return { ok: true as const };
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
          inscricaoEstadual: this.trimOptional(dto.inscricaoEstadual) ?? null,
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

  async deleteCustomer(id: string) {
    await this.assertCustomerExists(id);
    await this.safeDelete(
      () => this.prisma.client.customer.delete({ where: { id } }),
      'Não é possível excluir: cliente vinculado a pedidos, financeiro ou CRM.',
    );
    return { ok: true as const };
  }

  private async assertCustomerExists(id: string) {
    const row = await this.prisma.client.customer.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Cliente não encontrado.');
    return row;
  }

  // --- Company entities (Multi-CNPJ) ---

  private normalizeCnpjDigits(value: string): string {
    return value.replace(/\D/g, '');
  }

  private serializeCompanyEntity(row: {
    id: string;
    name: string;
    cnpj: string;
    inscricaoEstadual: string | null;
    endereco: string | null;
    isMatriz: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      name: row.name,
      cnpj: row.cnpj,
      inscricaoEstadual: row.inscricaoEstadual,
      endereco: row.endereco,
      isMatriz: row.isMatriz,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  listCompanyEntities() {
    return this.prisma.client.companyEntity
      .findMany({
        orderBy: [{ isMatriz: 'desc' }, { name: 'asc' }],
      })
      .then((rows) => rows.map((row) => this.serializeCompanyEntity(row)));
  }

  async createCompanyEntity(dto: {
    name: string;
    cnpj: string;
    inscricaoEstadual?: string;
    endereco?: string;
    isMatriz?: boolean;
  }) {
    const cnpj = this.normalizeCnpjDigits(dto.cnpj);
    if (cnpj.length < 11) {
      throw new BadRequestException('CNPJ inválido.');
    }
    if (dto.isMatriz) {
      await this.prisma.client.companyEntity.updateMany({
        where: { isMatriz: true },
        data: { isMatriz: false },
      });
    }
    try {
      const created = await this.prisma.client.companyEntity.create({
        data: {
          name: dto.name.trim(),
          cnpj,
          inscricaoEstadual: this.trimOptional(dto.inscricaoEstadual) ?? null,
          endereco: this.trimOptional(dto.endereco) ?? null,
          isMatriz: Boolean(dto.isMatriz),
        },
      });
      return this.serializeCompanyEntity(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('Já existe empresa com este CNPJ.');
      }
      throw error;
    }
  }

  async updateCompanyEntity(
    id: string,
    dto: {
      name?: string;
      cnpj?: string;
      inscricaoEstadual?: string | null;
      endereco?: string | null;
      isMatriz?: boolean;
      isActive?: boolean;
    },
  ) {
    await this.assertCompanyEntityExists(id);
    const data: {
      name?: string;
      cnpj?: string;
      inscricaoEstadual?: string | null;
      endereco?: string | null;
      isMatriz?: boolean;
      isActive?: boolean;
    } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.cnpj !== undefined) {
      const cnpj = this.normalizeCnpjDigits(dto.cnpj);
      if (cnpj.length < 11) {
        throw new BadRequestException('CNPJ inválido.');
      }
      data.cnpj = cnpj;
    }
    if (dto.inscricaoEstadual !== undefined) {
      data.inscricaoEstadual = this.trimOptional(dto.inscricaoEstadual) ?? null;
    }
    if (dto.endereco !== undefined) {
      data.endereco = this.trimOptional(dto.endereco) ?? null;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.isMatriz === true) {
      await this.prisma.client.companyEntity.updateMany({
        where: { isMatriz: true, NOT: { id } },
        data: { isMatriz: false },
      });
      data.isMatriz = true;
    } else if (dto.isMatriz === false) {
      data.isMatriz = false;
    }

    try {
      const updated = await this.prisma.client.companyEntity.update({
        where: { id },
        data,
      });
      return this.serializeCompanyEntity(updated);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('Já existe empresa com este CNPJ.');
      }
      throw error;
    }
  }

  async toggleCompanyEntity(id: string) {
    const row = await this.assertCompanyEntityExists(id);
    const updated = await this.prisma.client.companyEntity.update({
      where: { id },
      data: { isActive: !row.isActive },
    });
    return this.serializeCompanyEntity(updated);
  }

  private async assertCompanyEntityExists(id: string) {
    const row = await this.prisma.client.companyEntity.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Empresa não encontrada.');
    return row;
  }
}
