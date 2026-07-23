import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCompanyEntityDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório.' })
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsNotEmpty({ message: 'CNPJ é obrigatório.' })
  @MaxLength(18)
  cnpj!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  inscricaoEstadual?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  endereco?: string;

  @IsOptional()
  @IsBoolean()
  isMatriz?: boolean;
}

export class UpdateCompanyEntityDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório.' })
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'CNPJ é obrigatório.' })
  @MaxLength(18)
  cnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  inscricaoEstadual?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  endereco?: string | null;

  @IsOptional()
  @IsBoolean()
  isMatriz?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
