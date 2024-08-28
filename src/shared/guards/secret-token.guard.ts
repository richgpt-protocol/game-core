import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

@Injectable()
export class SecretTokenGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    // Retrieve the secret token from environment variables
    const secretToken = process.env.WEBHOOK_SECRET_TOKEN;

    // Check if the authorization header contains the correct secret token
    if (authHeader !== `Bearer ${secretToken}`) {
      throw new UnauthorizedException('Invalid secret token');
    }

    return true; // Grant access if the secret token is valid
  }
}
