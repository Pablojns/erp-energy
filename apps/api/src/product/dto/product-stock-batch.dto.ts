import { ArrayMaxSize, IsArray, IsOptional, IsString } from 'class-validator';

/** Lookup em lote de estoque disponível (evita N+1 no client). */
export class ProductStockBatchDto {
  /** Aceita string: ids inválidos são ignorados no service (não derrubam o lote inteiro). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  skus?: string[];
}
