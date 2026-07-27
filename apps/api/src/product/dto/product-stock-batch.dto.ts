import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

/** Lookup em lote de estoque disponível (evita N+1 no client). */
export class ProductStockBatchDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ids?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  skus?: string[];
}
