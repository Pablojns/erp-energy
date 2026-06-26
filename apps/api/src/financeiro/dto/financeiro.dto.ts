import {
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const DESPESA_CATEGORIAS = [
  'FRETE',
  'MATERIAL',
  'OPERACIONAL',
  'OUTROS',
] as const;

export class CriarDespesaDto {
  @IsString()
  @MaxLength(500)
  descricao!: string;

  @IsIn(DESPESA_CATEGORIAS)
  categoria!: (typeof DESPESA_CATEGORIAS)[number];

  @IsNumberString()
  valor!: string;

  @IsString()
  data!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fornecedor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}

export class PagarNfDto {
  @IsString()
  dataPagamento!: string;
}

export class CobrarNfDto {
  @IsString()
  @MaxLength(2000)
  observacao!: string;
}

export class FinanceiroPeriodQueryDto {
  @IsOptional()
  @IsString()
  dataInicio?: string;

  @IsOptional()
  @IsString()
  dataFim?: string;
}

export class NfsEmAbertoQueryDto {
  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;
}
