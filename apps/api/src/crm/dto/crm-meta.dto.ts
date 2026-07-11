import {
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CRM_CARD_ORIGINS } from './create-crm-card.dto';

export class UpsertCrmMetaDto {
  @IsInt()
  @Min(1)
  mes!: number;

  @IsInt()
  @Min(2000)
  ano!: number;

  @IsInt()
  @Min(0)
  metaLeads!: number;

  @IsInt()
  @Min(0)
  metaFechamentos!: number;

  @IsNumber()
  @Min(0)
  metaValor!: number;
}

export class ImportCrmLeadItemDto {
  @IsString()
  @MaxLength(200)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefone?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string | null;

  @IsString()
  @IsIn(CRM_CARD_ORIGINS)
  origem!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valor?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  observacoes?: string | null;
}

export class ImportCrmLeadsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportCrmLeadItemDto)
  leads!: ImportCrmLeadItemDto[];
}

export class UpdateCrmCardResponsavelDto {
  @IsOptional()
  @IsUUID()
  responsavelId?: string | null;
}
