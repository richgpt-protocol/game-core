import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class IpWhitelistMiddleware implements NestMiddleware {
  // Define the list of allowed IPs
  private readonly allowedIps: string[] = [
    '', // deposit-bot VM server
  ];

  use(req: Request, res: Response, next: NextFunction) {
    let clientIp = req.headers['x-forwarded-for'] as string || req.ip;

    // Handle multiple IPs in X-Forwarded-For (real client IP is the first one)
    if (clientIp.includes(',')) {
      clientIp = clientIp.split(',')[0].trim();
    }

    // Normalize IPv6-mapped IPv4 addresses
    if (clientIp.startsWith('::ffff:')) {
      clientIp = clientIp.replace('::ffff:', '');
    }

    // console.log('IpWhitelistMiddleware: client IP:', clientIp);
    if (this.allowedIps.includes(clientIp)) {
      next(); // Allow the request if the IP is in the list
    } else {
      throw new UnauthorizedException('IP not allowed');
    }
  }
}
