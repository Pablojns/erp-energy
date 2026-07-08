import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class GenerateRomaneioDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  orderIds!: string[];
}
