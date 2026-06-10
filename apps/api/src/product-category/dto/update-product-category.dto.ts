import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateProductCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{3}$|^#[0-9A-Fa-f]{6}$/, {
    message: 'Informe uma cor HEX (#RGB ou #RRGGBB).',
  })
  color?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
