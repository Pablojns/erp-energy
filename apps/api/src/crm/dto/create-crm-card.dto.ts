import {
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export const CRM_CARD_ORIGINS = ['ANUNCIO', 'INDICACAO', 'FRIO'] as const;
export type CrmCardOrigin = (typeof CRM_CARD_ORIGINS)[number];

export class CreateCrmCardDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number | null;

  @IsString()
  @IsIn(CRM_CARD_ORIGINS)
  origin!: CrmCardOrigin;

  @IsOptional()
  @IsInt()
  @Min(0)
  touchPoints?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @IsOptional()
  @IsString()
  whatsappLog?: string | null;

  @IsString()
  funilId!: string;
}
