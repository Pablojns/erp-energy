import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateOrderItemDto } from './create-order-item.dto';

export class CreateOrderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  customerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  customerDocument?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  customerState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  /** 1 = crítica … 5 = baixa */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
