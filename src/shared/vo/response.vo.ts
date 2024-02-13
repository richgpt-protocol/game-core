import { ApiProperty } from '@nestjs/swagger';

export class BaseResponseVo {
  @ApiProperty()
  statusCode: number;

  @ApiProperty()
  message: string | string[];
}

export class ErrorResponseVo {
  @ApiProperty()
  statusCode: number;

  @ApiProperty()
  message: string[];
}

export class ResponseVo<T> extends BaseResponseVo {
  @ApiProperty()
  data: T;
}

export class ResponseListVo<T> extends ResponseVo<T> {
  @ApiProperty()
  total: number;
}
