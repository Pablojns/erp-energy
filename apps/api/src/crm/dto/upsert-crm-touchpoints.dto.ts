import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CrmTouchpointItemDto {
  @IsInt()
  @Min(1)
  @Max(7)
  number!: number;

  @IsBoolean()
  done!: boolean;

  @IsOptional()
  @IsString()
  date?: string | null;

  @IsOptional()
  @IsString()
  channel?: string | null;
}

export class UpsertCrmTouchpointsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => CrmTouchpointItemDto)
  touchpoints!: CrmTouchpointItemDto[];
}
