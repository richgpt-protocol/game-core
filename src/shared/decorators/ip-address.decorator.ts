import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import * as requestIp from 'request-ip';

export const IpAddress = createParamDecorator((data, ctx: ExecutionContext) => {
  if (ctx.switchToHttp().getRequest().ip)
    return ctx.switchToHttp().getRequest().ip;
  return requestIp.getClientIp(ctx.switchToHttp().getRequest()); // In case we forgot to include requestIp.mw() in main.ts
});
