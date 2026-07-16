import { IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateQuoteProposalDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactEmail?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  validityDays?: number;
}

export class SendQuoteProposalEmailDto {
  @IsEmail()
  @MaxLength(200)
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string | null;
}
