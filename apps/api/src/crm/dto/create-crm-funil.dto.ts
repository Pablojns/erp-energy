import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateCrmFunilDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string | null;
}
