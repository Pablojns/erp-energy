import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CrmPropostaItemInputDto {
  @IsString()
  @MaxLength(500)
  descricao!: string;

  @IsInt()
  @Min(1)
  quantidade!: number;

  @IsNumber()
  @Min(0)
  valorUnit!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  desconto?: number;
}

export class CreateCrmPropostaDto {
  @IsString()
  @MaxLength(200)
  titulo!: string;

  @IsOptional()
  @IsString()
  validade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  observacoes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  desconto?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CrmPropostaItemInputDto)
  itens!: CrmPropostaItemInputDto[];
}

export class UpdateCrmPropostaDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  titulo?: string;

  @IsOptional()
  @IsString()
  validade?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  observacoes?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  desconto?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CrmPropostaItemInputDto)
  itens?: CrmPropostaItemInputDto[];
}
