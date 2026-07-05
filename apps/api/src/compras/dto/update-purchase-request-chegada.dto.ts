import { IsDateString } from 'class-validator';

export class UpdatePurchaseRequestChegadaDto {
  @IsDateString()
  expectedArrival!: string;
}
