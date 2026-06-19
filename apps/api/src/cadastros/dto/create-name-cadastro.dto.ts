import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateNameCadastroDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório.' })
  @MaxLength(200)
  name!: string;
}
