import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PermissionGuard } from '../guards/permission.guard';
import { RolesGuard } from '../guards/roles.guard';
import { ErrorResponseVo } from '../vo/response.vo';

export const ROLES_KEY = 'roles';
export const PERMISSION_KEY = 'required-permission';

export function Secure(permission?: string, ...roles: string[]) {
  return applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    SetMetadata(PERMISSION_KEY, permission),
    ApiBearerAuth(),
    UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard),
    ApiResponse({
      status: 401,
      description: 'Unauthorized',
      type: ErrorResponseVo,
    }),
    ApiResponse({
      status: 403,
      description: 'Forbidden Resources',
      type: ErrorResponseVo,
    }),
  );
}
