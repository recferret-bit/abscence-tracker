import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { AuthenticatedUser } from './auth.service';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return req.user;
  },
);
