import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  /** Se omitido, o backend usa o próprio SKU. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  internalCode?: string;

  @IsString()
  @IsNotEmpty({ message: 'SKU é obrigatório.' })
  @MaxLength(64)
  @Matches(/\S/, { message: 'SKU não pode ser vazio ou só espaços.' })
  sku!: string;

  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório.' })
  @MaxLength(200)
  name!: string;

  /** Se omitida, o backend usa o nome do produto. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  /** Categoria cadastrada (recomendado). */
  @IsOptional()
  @IsUUID('4', { message: 'Categoria inválida.' })
  categoryId?: string;

  /** Texto livre legado (sem FK). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Preço inválido.' })
  @Min(0, { message: 'Preço não pode ser negativo.' })
  @Max(999_999_999.99)
  price!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Custo inválido.' })
  @Min(0, { message: 'Custo não pode ser negativo.' })
  @Max(999_999_999.99)
  cost?: number;

  @Type(() => Number)
  @IsInt({ message: 'Estoque mínimo deve ser inteiro.' })
  @Min(0, { message: 'Estoque mínimo não pode ser negativo.' })
  minStock!: number;
}
