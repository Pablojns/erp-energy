import { IsIn } from 'class-validator';
import { ORDER_STATUS_VALUES } from '../order-domain';

export class UpdateOrderStatusDto {
  @IsIn(ORDER_STATUS_VALUES)
  status!: string;
}
