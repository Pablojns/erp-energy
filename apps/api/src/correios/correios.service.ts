import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { PDFDocument } from 'pdf-lib';
import { inflateSync } from 'zlib';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CorreiosService {
  private readonly logger = new Logger(CorreiosService.name);
  private readonly api: AxiosInstance;
  private token: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const baseURL =
      config.get('CORREIOS_ENV') === 'producao'
        ? 'https://api.correios.com.br'
        : 'https://apihom.correios.com.br';

    this.api = axios.create({ baseURL });
  }

  // ─── Token (renovação automática) ─────────────────────────────────────────

  private async getToken(): Promise<string> {
    if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.token;
    }

    const usuario = this.config.get<string>('CORREIOS_USUARIO');
    const senhaComponente = this.config.get<string>('CORREIOS_SENHA_COMPONENTE');
    const cartao = this.config.get<string>('CORREIOS_CARTAO_POSTAGEM');

    const credentials = Buffer.from(`${usuario}:${senhaComponente}`).toString('base64');

    let data: any;
    try {
      const resp = await this.api.post(
        '/token/v1/autentica/cartaopostagem',
        { numero: cartao },
        {
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/json',
          },
        },
      );
      data = resp.data;
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      this.logger.error(
        `Correios auth falhou — status ${status} — body: ${JSON.stringify(body)}`,
      );
      throw err;
    }

    this.token = data.token;
    // Renova 1h antes de expirar (~24h de validade)
    this.tokenExpiry = new Date(data.expiraEm);
    this.tokenExpiry.setHours(this.tokenExpiry.getHours() - 1);

    this.logger.log('Token Correios renovado com sucesso');
    return this.token!;
  }

  private async authHeader() {
    const token = await this.getToken();
    return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  }

  /** Remove acentos e normaliza texto para o padrão DNE/Correios. */
  private formatCorreiosText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private ufParaRegiao(uf: string): string {
    const map: Record<string, string> = {
      AC: 'Acre',
      AL: 'Alagoas',
      AP: 'Amapa',
      AM: 'Amazonas',
      BA: 'Bahia',
      CE: 'Ceara',
      DF: 'Distrito Federal',
      ES: 'Espirito Santo',
      GO: 'Goias',
      MA: 'Maranhao',
      MT: 'Mato Grosso',
      MS: 'Mato Grosso do Sul',
      MG: 'Minas Gerais',
      PA: 'Para',
      PB: 'Paraiba',
      PR: 'Parana',
      PE: 'Pernambuco',
      PI: 'Piaui',
      RJ: 'Rio de Janeiro',
      RN: 'Rio Grande do Norte',
      RS: 'Rio Grande do Sul',
      RO: 'Rondonia',
      RR: 'Roraima',
      SC: 'Santa Catarina',
      SP: 'Sao Paulo',
      SE: 'Sergipe',
      TO: 'Tocantins',
    };
    return map[uf.toUpperCase()] ?? uf.toUpperCase();
  }

  private formatCepDigits(cep: string): string {
    const digits = cep.replace(/\D/g, '');
    return digits.length === 8 ? digits : '';
  }

  /** Correios limita bairro a ~30 caracteres na etiqueta; o restante vai em complemento. */
  private splitCorreiosAddressField(
    text: string,
    maxLen = 30,
  ): { primary: string; overflow: string } {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length <= maxLen) {
      return { primary: trimmed, overflow: '' };
    }
    const cutAt = trimmed.lastIndexOf(' ', maxLen);
    if (cutAt > 0) {
      return {
        primary: trimmed.slice(0, cutAt).trim(),
        overflow: trimmed.slice(cutAt).trim(),
      };
    }
    return {
      primary: trimmed.slice(0, maxLen).trim(),
      overflow: trimmed.slice(maxLen).trim(),
    };
  }

  private packEnderecoLinhas(complemento: string, bairro: string) {
    const comp = this.formatCorreiosText(complemento);
    const bai = this.formatCorreiosText(bairro);

    if (comp && bai) {
      const bairroLinha =
        bai.length > 30 ? this.splitCorreiosAddressField(bai, 30).primary : bai;
      return {
        complemento: comp.slice(0, 30),
        bairro: bairroLinha.slice(0, 30),
      };
    }

    const combined = [comp, bai].filter(Boolean).join(' ').trim();
    if (!combined) {
      return { complemento: '', bairro: '' };
    }
    if (combined.length <= 30) {
      return { complemento: combined, bairro: '' };
    }

    const primeira = this.splitCorreiosAddressField(combined, 30);
    const segunda = this.splitCorreiosAddressField(primeira.overflow, 30);
    return {
      complemento: primeira.primary,
      bairro: segunda.primary,
    };
  }

  private normalizeEnderecoCorreios(
    endereco: {
      cep: string;
      logradouro: string;
      numero: string;
      complemento?: string;
      bairro: string;
      cidade: string;
      uf: string;
      regiao?: string;
    },
    options?: { incluirRegiao?: boolean },
  ) {
    let bairro = this.formatCorreiosText(endereco.bairro ?? '');
    let complemento = this.formatCorreiosText(endereco.complemento ?? '');
    const uf = endereco.uf.toUpperCase().slice(0, 2);
    const cidade = this.formatCorreiosText(endereco.cidade).slice(0, 30);
    const cep = this.formatCepDigits(endereco.cep);

    if (options?.incluirRegiao) {
      const packed = this.packEnderecoLinhas(complemento, bairro);
      complemento = packed.complemento;
      bairro = packed.bairro;
    } else {
      if (!bairro && complemento) {
        bairro = complemento;
        complemento = '';
      }
      if (bairro.length > 30) {
        const split = this.splitCorreiosAddressField(bairro);
        bairro = split.primary;
        complemento = [split.overflow, complemento].filter(Boolean).join(' ').trim();
      }
      if (complemento.length > 30) {
        const split = this.splitCorreiosAddressField(complemento);
        complemento = split.primary;
      }
    }

    const normalized = {
      cep,
      logradouro: this.formatCorreiosText(endereco.logradouro).slice(0, 50),
      numero: endereco.numero.trim().slice(0, 6) || 'S/N',
      complemento: complemento.slice(0, 30),
      bairro: bairro.slice(0, 30),
      cidade,
      uf,
    };

    if (options?.incluirRegiao) {
      return {
        ...normalized,
        regiao: this.formatCorreiosText(
          endereco.regiao?.trim() || this.ufParaRegiao(uf),
        ).slice(0, 50),
      };
    }

    return normalized;
  }

  async enrichEnderecoFromCep(endereco: {
    cep: string;
    logradouro: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cidade: string;
    uf: string;
  }) {
    const cep = this.formatCepDigits(endereco.cep);
    if (cep.length !== 8) return endereco;

    try {
      const cepData = (await this.buscarCep(cep)) as Record<string, string>;
      return {
        cep,
        logradouro: this.formatCorreiosText(
          endereco.logradouro || cepData.logradouro || cepData.end || '',
        ),
        numero: endereco.numero.trim() || 'S/N',
        complemento: this.formatCorreiosText(endereco.complemento ?? ''),
        bairro: this.formatCorreiosText(
          endereco.bairro || (endereco.complemento ? '' : cepData.bairro) || '',
        ),
        cidade: this.formatCorreiosText(
          endereco.cidade || cepData.localidade || cepData.cidade || '',
        ),
        uf: (endereco.uf || cepData.uf || '').toUpperCase().slice(0, 2),
      };
    } catch {
      return {
        ...endereco,
        cep,
        uf: endereco.uf.toUpperCase().slice(0, 2),
      };
    }
  }

  // ─── CEP ──────────────────────────────────────────────────────────────────

  async buscarCep(cep: string) {
    const headers = await this.authHeader();
    const { data } = await this.api.get(`/cep/v1/enderecos/${cep.replace(/\D/g, '')}`, {
      headers,
    });
    return data;
  }

  // ─── Prazo ────────────────────────────────────────────────────────────────

  async consultarPrazo(coProduto: string, cepOrigem: string, cepDestino: string) {
    const headers = await this.authHeader();
    const { data } = await this.api.get(`/prazo/v1/nacional/${coProduto}`, {
      headers,
      params: {
        cepOrigem: cepOrigem.replace(/\D/g, ''),
        cepDestino: cepDestino.replace(/\D/g, ''),
      },
    });
    return data;
  }

  // ─── Preço ────────────────────────────────────────────────────────────────

  async calcularFrete(params: {
    codigoServico: string;
    cepOrigem: string;
    cepDestino: string;
    pesoGramas: number;
    comprimento: number;
    largura: number;
    altura: number;
    vlDeclarado?: number;
  }) {
    const headers = await this.authHeader();
    const { data } = await this.api.get(`/preco/v1/nacional/${params.codigoServico}`, {
      headers,
      params: {
        cepOrigem: params.cepOrigem.replace(/\D/g, ''),
        cepDestino: params.cepDestino.replace(/\D/g, ''),
        psObjeto: params.pesoGramas,
        tpObjeto: 2, // 1=envelope, 2=pacote, 3=rolo
        comprimento: params.comprimento,
        largura: params.largura,
        altura: params.altura,
        vlDeclarado: params.vlDeclarado ?? 0,
      },
    });
    return data;
  }

  // ─── Rastreamento ─────────────────────────────────────────────────────────

  async rastrearObjeto(codigo: string) {
    const headers = await this.authHeader();
    const { data } = await this.api.get(`/srorastro/v1/objetos/${codigo}`, {
      headers,
      params: { resultado: 'T' },
    });
    return data;
  }

  async rastrearVarios(codigos: string[]) {
    const headers = await this.authHeader();
    const { data } = await this.api.get(`/srorastro/v1/objetos/${codigos.join(',')}`, {
      headers,
      params: { resultado: 'T' },
    });
    return data;
  }

  // ─── Pré-postagem ─────────────────────────────────────────────────────────

  async criarPrePostagem(
    payload: {
    remetente?: {
      nome: string;
      cpfCnpj: string;
      cep: string;
      logradouro: string;
      numero: string;
      complemento?: string;
      bairro: string;
      cidade: string;
      uf: string;
      telefone?: string;
      email?: string;
    };
    destinatario: {
      nome: string;
      cpfCnpj?: string;
      cep: string;
      logradouro: string;
      numero: string;
      complemento?: string;
      bairro: string;
      cidade: string;
      uf: string;
      telefone?: string;
      email?: string;
    };
    objeto: {
      codigoServico: string;
      pesoGramas: number;
      comprimento: number;
      largura: number;
      altura: number;
      valorDeclarado?: number;
      descricaoConteudo: string;
    };
    numeroNotaFiscal?: string;
    historico?: {
      nomeDestinatario: string;
      cepDestino: string;
      servico: string;
    };
  },
    userId?: string,
  ) {
    const headers = await this.authHeader();
    const remetente = payload.remetente ?? (await this.buildRemetentePadrao());

    const pesoGramas = Math.max(
      100,
      payload.objeto.pesoGramas > 0 ? Math.round(payload.objeto.pesoGramas) : 300,
    );
    const comprimento =
      payload.objeto.comprimento > 0 ? String(payload.objeto.comprimento) : '16';
    const largura = payload.objeto.largura > 0 ? String(payload.objeto.largura) : '11';
    const altura = payload.objeto.altura > 0 ? String(payload.objeto.altura) : '2';
    const valorDeclarado = payload.objeto.valorDeclarado ?? 0;
    const valorItem = valorDeclarado > 0 ? valorDeclarado.toFixed(2) : '10.00';
    const numeroNotaFiscal = payload.numeroNotaFiscal?.replace(/\D/g, '') || '0';

    const remetenteBase = await this.enrichEnderecoFromCep({
      cep: remetente.cep,
      logradouro: remetente.logradouro,
      numero: remetente.numero,
      complemento: remetente.complemento,
      bairro: remetente.bairro,
      cidade: remetente.cidade,
      uf: remetente.uf,
    });
    const destinatarioBase = await this.enrichEnderecoFromCep({
      cep: payload.destinatario.cep,
      logradouro: payload.destinatario.logradouro,
      numero: payload.destinatario.numero,
      complemento: payload.destinatario.complemento,
      bairro: payload.destinatario.bairro,
      cidade: payload.destinatario.cidade,
      uf: payload.destinatario.uf,
    });

    const remetenteEndereco = this.normalizeEnderecoCorreios(remetenteBase);
    const destinatarioEndereco = this.normalizeEnderecoCorreios(destinatarioBase, {
      incluirRegiao: true,
    });

    const body = {
      remetente: {
        nome: remetente.nome,
        cpfCnpj: remetente.cpfCnpj.replace(/\D/g, ''),
        endereco: remetenteEndereco,
        telefone: remetente.telefone ?? '',
        email: remetente.email ?? '',
      },
      destinatario: {
        nome: payload.destinatario.nome,
        cpfCnpj: payload.destinatario.cpfCnpj?.replace(/\D/g, '') ?? '',
        endereco: destinatarioEndereco,
        telefone: payload.destinatario.telefone ?? '',
        email: payload.destinatario.email ?? '',
      },
      codigoServico: payload.objeto.codigoServico,
      pesoInformado: String(pesoGramas),
      codigoFormatoObjetoInformado: '2',
      alturaInformada: altura,
      larguraInformada: largura,
      comprimentoInformado: comprimento,
      modalidadePagamento: '2',
      numeroNotaFiscal,
      emiteDCe: 'S',
      cienteObjetoNaoProibido: '1',
      itensDeclaracaoConteudo: [
        {
          conteudo: payload.objeto.descricaoConteudo.slice(0, 200),
          quantidade: '1',
          valor: valorItem,
        },
      ],
    };

    let data: Record<string, unknown>;
    try {
      const resp = await this.api.post('/prepostagem/v1/prepostagens', body, { headers });
      data = resp.data;
    } catch (err: any) {
      const status = err?.response?.status;
      const apiBody = err?.response?.data;
      this.logger.error(
        `Pré-postagem Correios falhou — status ${status} — body: ${JSON.stringify(apiBody)}`,
      );
      const msg =
        apiBody?.msgs?.join?.(' ') ||
        apiBody?.message ||
        apiBody?.detail ||
        'Falha ao criar pré-postagem nos Correios.';
      throw new BadRequestException(msg);
    }

    const id = data?.id ?? data?.idPrePostagem;
    if (typeof id === 'string' && id.length > 0) {
      await this.aguardarStatusPrePostado(id);
    }

    if (payload.historico && typeof id === 'string' && id.length > 0) {
      const codigoRastreio =
        typeof data?.codigoObjeto === 'string' ? data.codigoObjeto.trim() : '';
      await this.registrarEtiqueta({
        codigoRastreio,
        prePostagemId: id,
        nomeDestinatario: payload.historico.nomeDestinatario,
        cepDestino: payload.historico.cepDestino,
        servico: payload.historico.servico,
        userId,
      });
    }

    return data;
  }

  async listEtiquetas() {
    return this.prisma.client.correiosEtiqueta.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async excluirEtiqueta(id: string) {
    const row = await this.prisma.client.correiosEtiqueta.findUnique({
      where: { id },
    });
    if (!row) {
      throw new BadRequestException('Etiqueta não encontrada.');
    }
    await this.prisma.client.correiosEtiqueta.delete({ where: { id } });
    return { ok: true };
  }

  async atualizarEtiqueta(
    id: string,
    input: {
      codigoRastreio?: string;
      prePostagemId?: string;
      nomeDestinatario?: string;
      cepDestino?: string;
      servico?: string;
      status?: string;
    },
  ) {
    const row = await this.prisma.client.correiosEtiqueta.findUnique({
      where: { id },
    });
    if (!row) {
      throw new BadRequestException('Etiqueta não encontrada.');
    }

    const data: {
      codigoRastreio?: string;
      prePostagemId?: string;
      nomeDestinatario?: string;
      cepDestino?: string;
      servico?: string;
      status?: string;
    } = {};

    if (input.codigoRastreio !== undefined) {
      data.codigoRastreio = input.codigoRastreio.trim();
    }
    if (input.prePostagemId !== undefined) {
      data.prePostagemId = input.prePostagemId.trim();
    }
    if (input.nomeDestinatario !== undefined) {
      data.nomeDestinatario = input.nomeDestinatario.trim();
    }
    if (input.cepDestino !== undefined) {
      data.cepDestino = input.cepDestino.replace(/\D/g, '');
    }
    if (input.servico !== undefined) {
      data.servico = input.servico.trim();
    }
    if (input.status !== undefined) {
      data.status = input.status.trim();
    }

    return this.prisma.client.correiosEtiqueta.update({
      where: { id },
      data,
    });
  }

  async registrarEtiqueta(input: {
    codigoRastreio: string;
    prePostagemId: string;
    nomeDestinatario: string;
    cepDestino: string;
    servico: string;
    userId?: string;
  }) {
    return this.prisma.client.correiosEtiqueta.create({
      data: {
        codigoRastreio: input.codigoRastreio,
        prePostagemId: input.prePostagemId,
        nomeDestinatario: input.nomeDestinatario,
        cepDestino: input.cepDestino.replace(/\D/g, ''),
        servico: input.servico,
        status: 'ATIVA',
        userId: input.userId ?? null,
      },
    });
  }

  private async aguardarStatusPrePostado(
    idPrePostagem: string,
    maxTentativas = 15,
    intervaloMs = 2000,
  ): Promise<void> {
    const headers = await this.authHeader();

    for (let i = 0; i < maxTentativas; i++) {
      const { data } = await this.api.get('/prepostagem/v2/prepostagens', {
        headers,
        params: { id: idPrePostagem },
      });
      const item = data?.itens?.[0] ?? data?.content?.[0];
      if (item?.statusAtual === 2) return;
      if (item?.descStatusAtual === 'Pré-postado') return;
      await new Promise((resolve) => setTimeout(resolve, intervaloMs));
    }

    throw new BadRequestException(
      'Pré-postagem Correios ainda não está disponível para impressão do rótulo.',
    );
  }

  // ─── Rótulo PDF ───────────────────────────────────────────────────────────

  // Etiqueta adesiva 10×16 cm retrato (de pé — portal postal Correios / 4×6)
  private readonly labelWidthPt = (100 / 25.4) * 72;
  private readonly labelHeightPt = (160 / 25.4) * 72;

  /** Expande o recorte para incluir a borda fina do rótulo (pt). */
  private readonly rotuloPadPt = 1;

  private extrairLimitesRotulo(pdfBuffer: Buffer): {
    left: number;
    bottom: number;
    right: number;
    top: number;
  } | null {
    const raw = pdfBuffer.toString('binary');
    const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;

    let melhor: {
      left: number;
      bottom: number;
      right: number;
      top: number;
      area: number;
    } | null = null;

    let match: RegExpExecArray | null;
    while ((match = streamRe.exec(raw))) {
      let data = Buffer.from(match[1], 'binary');
      try {
        data = inflateSync(data);
      } catch {
        continue;
      }

      const pts: Array<[number, number]> = [];
      for (const line of data.toString('latin1').split('\n')) {
        const move = line.match(/^(-?[0-9.]+) (-?[0-9.]+) m$/);
        const lineTo = line.match(/^(-?[0-9.]+) (-?[0-9.]+) l$/);
        if (move) pts.push([Number(move[1]), Number(move[2])]);
        if (lineTo) pts.push([Number(lineTo[1]), Number(lineTo[2])]);

        if (line !== 'h') continue;

        if (pts.length < 4) {
          pts.length = 0;
          continue;
        }

        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const left = Math.min(...xs);
        const right = Math.max(...xs);
        const bottom = Math.min(...ys);
        const top = Math.max(...ys);
        const w = right - left;
        const h = top - bottom;

        // Retângulo da etiqueta adesiva (~10×11,8 cm no A4 dos Correios).
        if (w < 250 || w > 320 || h < 280 || h > 380) {
          pts.length = 0;
          continue;
        }

        const area = w * h;
        if (!melhor || area > melhor.area) {
          melhor = { left, right, bottom, top, area };
        }
        pts.length = 0;
      }
    }

    if (!melhor) return null;

    return {
      left: Math.max(0, melhor.left - this.rotuloPadPt),
      bottom: Math.max(0, melhor.bottom - this.rotuloPadPt),
      right: melhor.right + this.rotuloPadPt,
      top: melhor.top + this.rotuloPadPt,
    };
  }

  private limitesRotuloFallback(pageHeight: number): {
    left: number;
    bottom: number;
    right: number;
    top: number;
  } {
    const cropW = (100 / 25.4) * 72;
    const cropH = (118 / 25.4) * 72;
    return {
      left: (3.8 / 25.4) * 72,
      bottom: pageHeight - cropH,
      right: (3.8 / 25.4) * 72 + cropW,
      top: pageHeight,
    };
  }

  private async ajustarRotuloPdf4x6(pdfBuffer: Buffer): Promise<Buffer> {
    const srcDoc = await PDFDocument.load(pdfBuffer);
    const srcPage = srcDoc.getPages()[0];
    const { height: pageHeight } = srcPage.getSize();
    const bounds =
      this.extrairLimitesRotulo(pdfBuffer) ??
      this.limitesRotuloFallback(pageHeight);

    const cropW = Math.max(1, bounds.right - bounds.left);
    const cropH = Math.max(1, bounds.top - bounds.bottom);

    const destDoc = await PDFDocument.create();
    const embedded = await destDoc.embedPage(srcPage, {
      left: bounds.left,
      bottom: bounds.bottom,
      right: bounds.right,
      top: bounds.top,
    });

    const scale = Math.min(
      this.labelWidthPt / cropW,
      this.labelHeightPt / cropH,
    );
    const drawW = cropW * scale;
    const drawH = cropH * scale;
    const x = (this.labelWidthPt - drawW) / 2;
    const y = this.labelHeightPt - drawH;

    const destPage = destDoc.addPage([this.labelWidthPt, this.labelHeightPt]);
    destPage.drawPage(embedded, {
      x,
      y,
      width: drawW,
      height: drawH,
    });

    return Buffer.from(await destDoc.save());
  }

  async gerarRotulo(idsPrePostagem: string[], tipoRotulo: 'P' | 'R' = 'P'): Promise<Buffer> {
    const headers = await this.authHeader();

    let lote: Record<string, unknown>;
    try {
      const resp = await this.api.post(
        '/prepostagem/v1/prepostagens/rotulo/assincrono/pdf',
        { idsPrePostagem, tipoRotulo, formatoRotulo: 'ET' },
        { headers },
      );
      lote = resp.data;
    } catch (err: any) {
      const apiBody = err?.response?.data;
      this.logger.error(
        `Solicitação de rótulo Correios falhou — body: ${JSON.stringify(apiBody)}`,
      );
      const msg =
        apiBody?.msgs?.join?.(' ') ||
        apiBody?.message ||
        apiBody?.detail ||
        'Falha ao solicitar rótulo nos Correios.';
      throw new BadRequestException(msg);
    }

    const idRecibo = (lote.idRecibo ?? lote.id) as string | undefined;
    if (!idRecibo) {
      throw new BadRequestException('Correios não retornou o recibo do rótulo.');
    }

    for (let i = 0; i < 15; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const { data, status, headers: respHeaders } = await this.api.get(
        `/prepostagem/v1/prepostagens/rotulo/download/assincrono/${idRecibo}`,
        {
          headers,
          responseType: 'arraybuffer',
          validateStatus: () => true,
        },
      );

      const contentType = String(respHeaders['content-type'] ?? '');
      if (status === 200 && contentType.includes('pdf')) {
        return this.ajustarRotuloPdf4x6(Buffer.from(data));
      }

      if (status === 200) {
        const raw = Buffer.from(data).toString('utf8');
        try {
          const parsed = JSON.parse(raw) as { dados?: string; nome?: string };
          if (parsed.dados) {
            return this.ajustarRotuloPdf4x6(Buffer.from(parsed.dados, 'base64'));
          }
        } catch {
          /* aguarda próxima tentativa */
        }
      }
    }

    throw new BadRequestException('Timeout ao gerar rótulo Correios.');
  }

  async buscarPrePostagemPorCodigoObjeto(codigoObjeto: string) {
    const headers = await this.authHeader();
    const codigo = codigoObjeto.replace(/\s/g, '').toUpperCase();
    const { data } = await this.api.get('/prepostagem/v2/prepostagens', {
      headers,
      params: { codigoObjeto: codigo },
    });
    return (data?.itens?.[0] ?? data?.content?.[0] ?? null) as
      | Record<string, unknown>
      | null;
  }

  async cancelarPrePostagem(idPrePostagem: string) {
    const headers = await this.authHeader();
    try {
      const { data } = await this.api.delete(
        `/prepostagem/v1/prepostagens/${idPrePostagem}`,
        { headers },
      );
      await this.prisma.client.correiosEtiqueta.updateMany({
        where: { prePostagemId: idPrePostagem },
        data: { status: 'CANCELADA' },
      });
      return data;
    } catch (err: any) {
      const apiBody = err?.response?.data;
      this.logger.error(
        `Cancelamento Correios falhou — body: ${JSON.stringify(apiBody)}`,
      );
      const msg =
        apiBody?.msgs?.join?.(' ') ||
        apiBody?.message ||
        apiBody?.detail ||
        apiBody?.resultadoCancelamento ||
        'Não foi possível cancelar a pré-postagem nos Correios.';
      throw new BadRequestException(msg);
    }
  }

  async getRemetentePadrao() {
    return this.buildRemetentePadrao();
  }

  private async buildRemetentePadrao(): Promise<{
    nome: string;
    cpfCnpj: string;
    cep: string;
    logradouro: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cidade: string;
    uf: string;
    telefone?: string;
    email?: string;
  }> {
    const cep = (this.config.get<string>('CORREIOS_CEP_ORIGEM') ?? '').replace(
      /\D/g,
      '',
    );
    if (cep.length !== 8) {
      throw new BadRequestException('CORREIOS_CEP_ORIGEM inválido ou ausente.');
    }

    let cepData: Record<string, string> = {};
    try {
      cepData = (await this.buscarCep(cep)) as Record<string, string>;
    } catch {
      /* usa fallback abaixo */
    }

    return {
      nome: 'Energy Brands',
      cpfCnpj: this.config.get<string>('CORREIOS_USUARIO') ?? '',
      cep,
      logradouro: cepData.logradouro ?? cepData.end ?? 'Endereco remetente',
      numero: 'S/N',
      bairro: cepData.bairro ?? '',
      cidade: cepData.localidade ?? cepData.cidade ?? '',
      uf: cepData.uf ?? '',
    };
  }

  async baixarComprovanteEntrega(codigo: string): Promise<Buffer> {
    const cod = codigo.replace(/\s/g, '').toUpperCase();
    if (cod.length !== 13) {
      throw new BadRequestException('Código de rastreio inválido.');
    }

    const rastreio = await this.rastrearObjeto(cod);
    if (!this.isObjetoEntregue(rastreio)) {
      throw new BadRequestException(
        'Comprovante disponível apenas para objetos entregues.',
      );
    }

    const headers = await this.authHeader();
    const indisponivelMsg =
      'Comprovante de entrega ainda não disponível para este objeto. Tente novamente em alguns minutos.';

    const tentarArDigital = async (): Promise<Buffer | null> => {
      const { data } = await this.api.get('/srorastro/v1/ar-digital', {
        headers,
        params: { objetos: cod },
      });
      return this.extrairComprovantePdf(data, cod);
    };

    // AR digital: 1ª tentativa; se falhar, aguarda 2s e tenta de novo antes do fallback
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      try {
        const pdf = await tentarArDigital();
        if (pdf) return pdf;
        this.logger.warn(
          `AR digital sem PDF para ${cod} (tentativa ${tentativa}/2)`,
        );
      } catch (err: any) {
        const status = err?.response?.status as number | undefined;
        this.logger.warn(
          `AR digital indisponível para ${cod} (tentativa ${tentativa}/2)` +
            `${status ? ` status=${status}` : ''}: ${err?.message ?? err}`,
        );
      }
      if (tentativa < 2) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    // Fallback assíncrono: /objetos/imagens → /recibo/{recibo}
    let reciboNum: string | undefined;
    try {
      const { data: recibo } = await this.api.post(
        '/srorastro/v1/objetos/imagens',
        [cod],
        { headers },
      );
      reciboNum =
        typeof recibo?.numero === 'string' ? recibo.numero : undefined;
    } catch (err: any) {
      const status = err?.response?.status as number | undefined;
      const apiBody = err?.response?.data;
      this.logger.error(
        `Solicitação de imagem Correios falhou — status=${status ?? '?'} body: ${JSON.stringify(apiBody)}`,
      );
      if (status === 404) {
        throw new BadRequestException(indisponivelMsg);
      }
      const msg =
        apiBody?.msgs?.join?.(' ') ||
        apiBody?.message ||
        apiBody?.detail ||
        indisponivelMsg;
      throw new BadRequestException(msg);
    }

    if (!reciboNum) {
      throw new BadRequestException(indisponivelMsg);
    }

    for (let i = 0; i < 15; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const { data: result } = await this.api.get(
          `/srorastro/v1/recibo/${reciboNum}`,
          { headers },
        );
        const pdf = await this.extrairComprovantePdf(result, cod);
        if (pdf) return pdf;
      } catch (err: any) {
        const status = err?.response?.status as number | undefined;
        this.logger.warn(
          `Recibo ${reciboNum} tentativa ${i + 1}/15 falhou` +
            `${status ? ` status=${status}` : ''}: ${err?.message ?? err}`,
        );
        if (status === 404) {
          throw new BadRequestException(indisponivelMsg);
        }
      }
    }

    throw new BadRequestException(indisponivelMsg);
  }

  private isObjetoEntregue(rastreio: unknown): boolean {
    if (!rastreio || typeof rastreio !== 'object') return false;
    const root = rastreio as Record<string, unknown>;
    const objetos = Array.isArray(root.objetos) ? root.objetos : [root];
    for (const objeto of objetos) {
      if (!objeto || typeof objeto !== 'object') continue;
      const row = objeto as Record<string, unknown>;
      const eventos = Array.isArray(row.eventos) ? row.eventos : [];
      for (const evento of eventos) {
        if (!evento || typeof evento !== 'object') continue;
        const ev = evento as Record<string, unknown>;
        const codigo = String(ev.codigo ?? '').toUpperCase();
        const descricao = String(ev.descricao ?? '').toLowerCase();
        if (codigo === 'BDE' || descricao.includes('entregue')) {
          return true;
        }
      }
    }
    return false;
  }

  private async extrairComprovantePdf(
    data: unknown,
    codigo: string,
  ): Promise<Buffer | null> {
    const items = Array.isArray(data) ? data : data ? [data] : [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const objeto = String(row.objeto ?? row.codObjeto ?? '').toUpperCase();
      if (objeto && objeto !== codigo) continue;

      const arBase64 = row.imagemBase64;
      if (typeof arBase64 === 'string' && arBase64.length > 0) {
        const buffer = Buffer.from(arBase64, 'base64');
        const contentType = String(row.contentType ?? 'image/jpeg');
        if (contentType.includes('pdf')) return buffer;
        return this.imagemParaPdf(buffer, contentType);
      }

      const imagens = Array.isArray(row.imagens) ? row.imagens : [];
      for (const imagem of imagens) {
        if (!imagem || typeof imagem !== 'object') continue;
        const imgRow = imagem as Record<string, unknown>;
        const raw = imgRow.imagem ?? imgRow.imagemBase64;
        if (typeof raw !== 'string' || raw.length === 0) continue;
        const buffer = Buffer.from(raw, 'base64');
        return this.imagemParaPdf(buffer, 'image/jpeg');
      }
    }
    return null;
  }

  private async imagemParaPdf(
    imageBuffer: Buffer,
    contentType: string,
  ): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const image = contentType.includes('png')
      ? await pdfDoc.embedPng(imageBuffer)
      : await pdfDoc.embedJpg(imageBuffer);
    const { width, height } = image.scale(1);
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
    return Buffer.from(await pdfDoc.save());
  }
}
