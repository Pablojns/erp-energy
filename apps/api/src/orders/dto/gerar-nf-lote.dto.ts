import { IsArray, ArrayMinSize, IsString } from 'class-validator';

export class GerarNfLoteDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  numeroPeds!: string[];
}
