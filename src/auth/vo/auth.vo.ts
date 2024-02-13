import { ApiProperty } from '@nestjs/swagger';
import { CreateAdminVo } from 'src/admin/vo/admin.vo';
import { ResponseVo } from 'src/shared/vo/response.vo';

export class AdminAuthVo extends CreateAdminVo {
  @ApiProperty()
  access_token: string;

  @ApiProperty()
  expiresIn: number;
}

export class ResponseAdminAuthVo extends ResponseVo<AdminAuthVo> {
  @ApiProperty({
    type: AdminAuthVo,
  })
  data;
}
