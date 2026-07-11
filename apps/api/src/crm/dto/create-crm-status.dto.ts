import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateCrmStatusDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
