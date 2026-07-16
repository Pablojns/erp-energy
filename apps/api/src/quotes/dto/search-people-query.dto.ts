import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SearchPeopleQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
