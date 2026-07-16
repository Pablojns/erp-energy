import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EngravingPriceTierDto {
  @IsInt()
  @Min(0)
  qtyFrom!: number;

  @IsInt()
  @Min(0)
  qtyTo!: number;

  @IsNumber()
  @Min(0)
  cost!: number;

  @IsString()
  @IsIn(['Unidade', 'Intervalo'])
  costType!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  applicationCost?: number;
}

export class CreateEngravingTechniqueDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  calculationType?: string;

  @IsOptional()
  @IsBoolean()
  multiplyColors?: boolean;

  @IsOptional()
  @IsString()
  supplierCompany?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EngravingPriceTierDto)
  tiers!: EngravingPriceTierDto[];
}
