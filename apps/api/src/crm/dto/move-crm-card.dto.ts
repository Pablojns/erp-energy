import { IsString } from 'class-validator';

export class MoveCrmCardDto {
  @IsString()
  funilId!: string;
}
