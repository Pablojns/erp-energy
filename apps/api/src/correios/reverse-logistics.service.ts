import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StockMovementType } from '@erp/database';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { CorreiosService } from './correios.service';

const REVERSE_STATUSES = [
  'AGUARDANDO_ENVIO',
  'EM_TRANSITO',
  'RECEBIDO',
  'CANCELADO',
] as const;

type PartyAddress = {
  nome: string;
  cpfCnpj?: string;
  email?: string;
  telefone?: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export type CreateReverseLogisticsInput = {
  orderId?: string;
  /** Cliente = remetente da etiqueta. */
  customerName: string;
  customerCnpj?: string;
  customerEmail?: string;
  customerCep: string;
  customerLogradouro: string;
  customerNumero: string;
  customerComplemento?: string;
  customerBairro: string;
  customerCidade: string;
  customerUf: string;
  /** Energy Brands = destinatário da etiqueta. */
  companyEntityId?: string;
  companyName: string;
  companyCnpj: string;
  companyEmail?: string;
  companyCep: string;
  companyLogradouro: string;
  companyNumero: string;
  companyComplemento?: string;
  companyBairro: string;
  companyCidade: string;
  companyUf: string;
  productId: string;
  quantity: number;
  reason: string;
  servico?: 'PAC' | 'SEDEX';
  /** AGENCIA (LRA) | COLETA (PC). Default AGENCIA. */
  modalidade?: 'AGENCIA' | 'COLETA';
  coletaDataPreferencial?: string;
  coletaPeriodo?: 'MANHA' | 'TARDE';
  pesoGramas?: number;
  valorDeclarado?: number;
};

@Injectable()
export class ReverseLogisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly correios: CorreiosService,
    private readonly stock: StockService,
  ) {}

  private resolveCodigoServico(
    servico: 'PAC' | 'SEDEX',
    modalidade: 'AGENCIA' | 'COLETA',
  ): string {
    if (modalidade === 'COLETA') {
      const key =
        servico === 'SEDEX'
          ? 'CORREIOS_CODIGO_SEDEX_REVERSO_PC'
          : 'CORREIOS_CODIGO_PAC_REVERSO_PC';
      const fallback = servico === 'SEDEX' ? '05991' : '06637';
      return (this.config.get<string>(key) ?? '').trim() || fallback;
    }
    const key =
      servico === 'SEDEX'
        ? 'CORREIOS_CODIGO_SEDEX_REVERSO'
        : 'CORREIOS_CODIGO_PAC_REVERSO';
    const fallback = servico === 'SEDEX' ? '03247' : '03301';
    return (this.config.get<string>(key) ?? '').trim() || fallback;
  }

  private requireParty(label: string, party: PartyAddress) {
    const nome = String(party.nome ?? '').trim();
    const cep = String(party.cep ?? '').replace(/\D/g, '');
    const uf = String(party.uf ?? '')
      .trim()
      .toUpperCase()
      .slice(0, 2);
    if (!nome) {
      throw new BadRequestException(`Informe o nome do ${label}.`);
    }
    if (cep.length !== 8) {
      throw new BadRequestException(`CEP do ${label} inválido.`);
    }
    if (
      !party.logradouro?.trim() ||
      !party.numero?.trim() ||
      !party.bairro?.trim() ||
      !party.cidade?.trim() ||
      uf.length !== 2
    ) {
      throw new BadRequestException(
        `Endereço completo do ${label} é obrigatório para gerar a etiqueta.`,
      );
    }
    return {
      nome,
      cpfCnpj: party.cpfCnpj?.replace(/\D/g, '') || undefined,
      email: party.email?.trim() || undefined,
      telefone: party.telefone?.trim() || undefined,
      cep,
      logradouro: party.logradouro.trim(),
      numero: party.numero.trim(),
      complemento: party.complemento?.trim() || undefined,
      bairro: party.bairro.trim(),
      cidade: party.cidade.trim(),
      uf,
    };
  }

  async create(input: CreateReverseLogisticsInput, userId?: string) {
    const reason = String(input.reason ?? '').trim();
    const quantity = Number(input.quantity);
    const productId = String(input.productId ?? '').trim();
    const modalidade =
      input.modalidade === 'COLETA' ? 'COLETA' : 'AGENCIA';
    const servico = input.servico === 'SEDEX' ? 'SEDEX' : 'PAC';

    if (!reason) {
      throw new BadRequestException('Informe o motivo da devolução.');
    }
    if (!productId) {
      throw new BadRequestException('Informe o produto.');
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException('Quantidade deve ser um inteiro maior que zero.');
    }

    const customer = this.requireParty('cliente (remetente)', {
      nome: input.customerName,
      cpfCnpj: input.customerCnpj,
      email: input.customerEmail,
      cep: input.customerCep,
      logradouro: input.customerLogradouro,
      numero: input.customerNumero,
      complemento: input.customerComplemento,
      bairro: input.customerBairro,
      cidade: input.customerCidade,
      uf: input.customerUf,
    });

    const companyEmailFallback =
      this.config.get<string>('CORREIOS_REMETENTE_EMAIL')?.trim() ||
      'expedicao@energybrands.com.br';

    const company = this.requireParty('Energy Brands (destinatário)', {
      nome: input.companyName,
      cpfCnpj: input.companyCnpj,
      email: input.companyEmail || companyEmailFallback,
      cep: input.companyCep,
      logradouro: input.companyLogradouro,
      numero: input.companyNumero,
      complemento: input.companyComplemento,
      bairro: input.companyBairro,
      cidade: input.companyCidade,
      uf: input.companyUf,
    });

    if (!company.cpfCnpj) {
      throw new BadRequestException('Informe o CNPJ da Energy Brands (destinatário).');
    }

    // PPN-252: e-mail do remetente (cliente) obrigatório na logística reversa.
    const customerEmail =
      customer.email ||
      `devolucao+${customer.cep}@energybrands.com.br`;

    let coletaDataPreferencial: Date | null = null;
    let coletaPeriodo: string | null = null;
    if (modalidade === 'COLETA') {
      if (input.coletaDataPreferencial) {
        const d = new Date(`${input.coletaDataPreferencial}T12:00:00`);
        if (Number.isNaN(d.getTime())) {
          throw new BadRequestException(
            'Data preferencial de coleta inválida (use YYYY-MM-DD).',
          );
        }
        coletaDataPreferencial = d;
      }
      if (input.coletaPeriodo === 'MANHA' || input.coletaPeriodo === 'TARDE') {
        coletaPeriodo = input.coletaPeriodo;
      }
    }

    const product = await this.prisma.client.product.findUnique({
      where: { id: productId },
      select: { id: true, sku: true, name: true, isActive: true },
    });
    if (!product) {
      throw new NotFoundException('Produto não encontrado.');
    }
    if (!product.isActive) {
      throw new BadRequestException('Produto inativo não pode ser usado na devolução.');
    }

    if (input.orderId) {
      const order = await this.prisma.client.order.findUnique({
        where: { id: input.orderId },
        select: { id: true },
      });
      if (!order) {
        throw new NotFoundException('Pedido informado não encontrado.');
      }
    }

    if (input.companyEntityId) {
      const entity = await this.prisma.client.companyEntity.findUnique({
        where: { id: input.companyEntityId },
        select: { id: true },
      });
      if (!entity) {
        throw new NotFoundException('CNPJ / empresa destinatária não encontrada.');
      }
    }

    const codigoServico = this.resolveCodigoServico(servico, modalidade);
    const pesoGramas =
      Number.isFinite(input.pesoGramas) && (input.pesoGramas as number) > 0
        ? Math.round(input.pesoGramas as number)
        : 300;
    const valorDeclarado =
      Number.isFinite(input.valorDeclarado) && (input.valorDeclarado as number) > 0
        ? Number(input.valorDeclarado)
        : 10;

    const descricao = `${product.name} (${product.sku})`.slice(0, 200);
    const descricaoOk =
      descricao.length >= 5 ? descricao : 'Devolucao produto';

    const servicoLabel =
      modalidade === 'COLETA'
        ? `${servico} Reverso Coleta`
        : `${servico} Reverso`;

    /**
     * Payload PPN:
     * - AGENCIA (LRA): logisticaReversa=S + códigos PAC/SEDEX Reverso
     * - COLETA (PC): logisticaReversa=N + códigos LOGISTICA REVERSA * PC
     * Em ambos: remetente = cliente, destinatario = Energy Brands
     * (para a etiqueta: cliente envia → Energy recebe).
     */
    const prePostagem = await this.correios.criarPrePostagem(
      {
        remetente: {
          nome: customer.nome,
          cpfCnpj: customer.cpfCnpj || '00000000000',
          email: customerEmail,
          telefone: customer.telefone,
          cep: customer.cep,
          logradouro: customer.logradouro,
          numero: customer.numero,
          complemento: customer.complemento,
          bairro: customer.bairro,
          cidade: customer.cidade,
          uf: customer.uf,
        },
        destinatario: {
          nome: company.nome,
          cpfCnpj: company.cpfCnpj,
          email: company.email || companyEmailFallback,
          telefone: company.telefone,
          cep: company.cep,
          logradouro: company.logradouro,
          numero: company.numero,
          complemento: company.complemento,
          bairro: company.bairro,
          cidade: company.cidade,
          uf: company.uf,
        },
        objeto: {
          codigoServico,
          pesoGramas,
          comprimento: 16,
          largura: 11,
          altura: 2,
          valorDeclarado,
          descricaoConteudo: descricaoOk,
        },
        logisticaReversa: modalidade === 'COLETA' ? 'N' : 'S',
        itensDeclaracaoConteudo: [
          {
            conteudo: descricaoOk,
            quantidade: String(quantity),
            valor: valorDeclarado.toFixed(2),
          },
        ],
        historico: {
          nomeDestinatario: company.nome,
          cepDestino: company.cep,
          servico: servicoLabel,
        },
      },
      userId,
    );

    const prePostagemId =
      typeof prePostagem?.id === 'string'
        ? prePostagem.id
        : typeof prePostagem?.idPrePostagem === 'string'
          ? prePostagem.idPrePostagem
          : null;
    const trackingCode =
      typeof prePostagem?.codigoObjeto === 'string'
        ? prePostagem.codigoObjeto.trim()
        : typeof prePostagem?.codigoRastreio === 'string'
          ? prePostagem.codigoRastreio.trim()
          : null;

    if (!prePostagemId) {
      throw new BadRequestException(
        'Pré-postagem de logística reversa criada sem ID. Verifique o retorno da API dos Correios.',
      );
    }

    const row = await this.prisma.client.reverseLogistics.create({
      data: {
        orderId: input.orderId || null,
        customerName: customer.nome,
        customerCnpj: customer.cpfCnpj || null,
        customerEmail: customerEmail,
        customerCep: customer.cep,
        customerLogradouro: customer.logradouro,
        customerNumero: customer.numero,
        customerComplemento: customer.complemento || null,
        customerBairro: customer.bairro,
        customerCidade: customer.cidade,
        customerUf: customer.uf,
        companyEntityId: input.companyEntityId || null,
        companyName: company.nome,
        companyCnpj: company.cpfCnpj || null,
        companyCep: company.cep,
        companyLogradouro: company.logradouro,
        companyNumero: company.numero,
        companyComplemento: company.complemento || null,
        companyBairro: company.bairro,
        companyCidade: company.cidade,
        companyUf: company.uf,
        productId: product.id,
        productSku: product.sku,
        productName: product.name,
        quantity,
        reason,
        modalidade,
        coletaDataPreferencial,
        coletaPeriodo,
        trackingCode,
        prePostagemId,
        codigoServico,
        status: 'AGUARDANDO_ENVIO',
      },
    });

    return {
      ...row,
      prePostagem,
    };
  }

  async list(filters: {
    status?: string;
    customer?: string;
    from?: string;
    to?: string;
  }) {
    const where: Record<string, unknown> = {};

    if (filters.status) {
      const status = filters.status.trim().toUpperCase();
      if (!(REVERSE_STATUSES as readonly string[]).includes(status)) {
        throw new BadRequestException(
          `Status inválido. Use: ${REVERSE_STATUSES.join(', ')}.`,
        );
      }
      where.status = status;
    }

    if (filters.customer?.trim()) {
      where.customerName = {
        contains: filters.customer.trim(),
        mode: 'insensitive',
      };
    }

    if (filters.from || filters.to) {
      const createdAt: { gte?: Date; lte?: Date } = {};
      if (filters.from) {
        const from = new Date(`${filters.from}T00:00:00.000`);
        if (Number.isNaN(from.getTime())) {
          throw new BadRequestException('Data inicial inválida (use YYYY-MM-DD).');
        }
        createdAt.gte = from;
      }
      if (filters.to) {
        const to = new Date(`${filters.to}T23:59:59.999`);
        if (Number.isNaN(to.getTime())) {
          throw new BadRequestException('Data final inválida (use YYYY-MM-DD).');
        }
        createdAt.lte = to;
      }
      where.createdAt = createdAt;
    }

    return this.prisma.client.reverseLogistics.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async receber(
    id: string,
    body: { returnToStock?: boolean },
    userId: string,
  ) {
    if (typeof body?.returnToStock !== 'boolean') {
      throw new BadRequestException(
        'Informe returnToStock: true (devolver ao estoque) ou false (não devolver).',
      );
    }

    const row = await this.prisma.client.reverseLogistics.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Registro de logística reversa não encontrado.');
    }
    if (row.status === 'CANCELADO') {
      throw new BadRequestException('Esta devolução está cancelada.');
    }
    if (row.status === 'RECEBIDO') {
      throw new BadRequestException('Esta devolução já foi marcada como recebida.');
    }

    if (body.returnToStock) {
      if (!row.productId) {
        throw new BadRequestException(
          'Não é possível devolver ao estoque: produto não vinculado ao registro.',
        );
      }
      await this.stock.createMovement(userId, {
        productId: row.productId,
        movementType: StockMovementType.RETURN,
        quantity: row.quantity,
        reference: `LR-${row.id.slice(0, 8)}`,
        notes: `Logística reversa recebida — ${row.productSku} — ${row.reason}`,
      });
    }

    return this.prisma.client.reverseLogistics.update({
      where: { id },
      data: {
        status: 'RECEBIDO',
        returnedToStock: body.returnToStock,
        receivedAt: new Date(),
      },
    });
  }

  /** Cancela pré-postagem nos Correios (se houver) e marca status CANCELADO. */
  async cancelar(id: string) {
    const row = await this.prisma.client.reverseLogistics.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Registro de logística reversa não encontrado.');
    }
    if (row.status === 'RECEBIDO') {
      throw new BadRequestException(
        'Não é possível cancelar uma devolução já marcada como recebida.',
      );
    }
    if (row.status === 'CANCELADO') {
      return { ...row, alreadyCancelled: true };
    }

    let correiosResult: unknown = null;
    if (row.prePostagemId?.trim()) {
      try {
        correiosResult = await this.correios.cancelarPrePostagem(
          row.prePostagemId.trim(),
        );
      } catch (err) {
        // cancelarPrePostagem já trata "já cancelada"; outras falhas propagam.
        throw err;
      }
    }

    const updated = await this.prisma.client.reverseLogistics.update({
      where: { id },
      data: { status: 'CANCELADO' },
    });

    return { ...updated, correiosResult };
  }

  /** Remove apenas o registro local — não chama a API dos Correios. */
  async excluir(id: string) {
    const row = await this.prisma.client.reverseLogistics.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Registro de logística reversa não encontrado.');
    }
    await this.prisma.client.reverseLogistics.delete({ where: { id } });
    return { ok: true };
  }
}
