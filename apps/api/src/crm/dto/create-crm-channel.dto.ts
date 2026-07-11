import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCrmChannelDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;
}
