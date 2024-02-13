import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const HandlerClass = createParamDecorator(
  (data, ctx: ExecutionContext) => {
    return {
      class: ctx.getClass().name,
      method: ctx.getHandler().name,
    };
  },
);
