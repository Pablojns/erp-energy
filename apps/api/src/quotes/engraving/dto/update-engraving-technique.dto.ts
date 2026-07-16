import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EngravingPriceTierDto } from './create-engraving-technique.dto';

export class UpdateEngravingTechniqueDto {
  @IsOptional()
  @IsString()
  name?: string;

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EngravingPriceTierDto)
  tiers?: EngravingPriceTierDto[];
}
