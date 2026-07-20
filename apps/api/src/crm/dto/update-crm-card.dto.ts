import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CRM_CARD_ORIGINS } from './create-crm-card.dto';

export class UpdateCrmCardDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

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

  @IsOptional()
  @IsString()
  @IsIn(CRM_CARD_ORIGINS)
  origin?: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  observations?: string | null;

  @IsOptional()
  @IsISO8601()
  entryDate?: string;

  @IsOptional()
  @IsISO8601()
  prospectionDate?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  contactsToday?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  convertedToMeeting?: number | null;

  @IsOptional()
  @IsString()
  funilId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  responsavelId?: string | null;

  @IsOptional()
  @IsString()
  motivoPerdaId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivoPerdaTexto?: string | null;
}
