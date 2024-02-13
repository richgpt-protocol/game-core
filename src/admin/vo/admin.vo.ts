import { ApiProperty } from '@nestjs/swagger';
import { ResponseVo } from 'src/shared/vo/response.vo';

export class CreateAdminVo {
  @ApiProperty()
  id: number;

  @ApiProperty()
  username: string;

  @ApiProperty()
  emailAddress: string;

  @ApiProperty()
  adminType: string;

  @ApiProperty()
  lastLogin: Date;

  @ApiProperty()
  status: string;
}

export class ResponseCreateAdminVo extends ResponseVo<CreateAdminVo> {
  @ApiProperty({
    type: CreateAdminVo,
  })
  data: CreateAdminVo;
}
