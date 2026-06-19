import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateNameCadastroDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}
