import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class IpWhitelistMiddleware implements NestMiddleware {
  // Define the list of allowed IPs
  private readonly allowedIps: string[] = ['18.219.125.24'];

  use(req: Request, res: Response, next: NextFunction) {
    const clientIp = req.ip;
    console.log('Client IP:', clientIp);

    if (this.allowedIps.includes(clientIp)) {
      next(); // Allow the request if the IP is in the list
    } else {
      throw new UnauthorizedException('IP not allowed');
    }
  }
}
