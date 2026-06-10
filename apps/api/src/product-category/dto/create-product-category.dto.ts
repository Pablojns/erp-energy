import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateProductCategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome da categoria é obrigatório.' })
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{3}$|^#[0-9A-Fa-f]{6}$/, {
    message: 'Informe uma cor HEX (#RGB ou #RRGGBB), ou omita.',
  })
  color?: string;

  /** Quando omitido, o slug é gerado a partir do nome. */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug inválido: use apenas letras minúsculas, números e hífen.',
  })
  @MaxLength(80)
  slug?: string;
}
