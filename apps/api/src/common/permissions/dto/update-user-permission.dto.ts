import { IsBoolean, IsUUID } from 'class-validator';

export class UpdateUserPermissionDto {
  @IsUUID()
  permissionId!: string;

  @IsBoolean()
  granted!: boolean;
}
