import { IsInt, Min } from 'class-validator';

export class UpdatePedidoVolumesDto {
  @IsInt()
  @Min(1)
  volumes!: number;
}
