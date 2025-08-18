import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { verifyToken } from '@clerk/backend';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req: any = context.switchToHttp().getRequest();
    const hdr = (req.headers?.authorization as string | undefined) || '';
    const bearer = hdr.startsWith('Bearer ') ? hdr.slice(7) : undefined;
    const cookie: string = (req.headers?.cookie as string | undefined) || '';
    const cookieToken = (() => {
      const m = /(?:^|;\s*)__session=([^;]+)/.exec(cookie);
      return m?.[1];
    })();
    // Also accept Clerk's proxy header if present (set by frontend runtime)
    const clerkHeader = (req.headers?.['x-clerk-auth-token'] as string | undefined) || undefined;
    const token = bearer || cookieToken || clerkHeader;
    if (!token) throw new UnauthorizedException('Missing authentication token');

    try {
      const jwtKey = process.env.CLERK_JWT_KEY; // optional PEM public key
      const secretKey = process.env.CLERK_SECRET_KEY; // secret key fallback
      const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
      const options: any = {
        authorizedParties: [origin],
      };
      if (jwtKey && jwtKey.trim().length > 0) {
        options.jwtKey = jwtKey;
      } else if (secretKey && secretKey.trim().length > 0) {
        options.secretKey = secretKey;
      } else {
        throw new Error('Missing Clerk verification key');
      }
      const verified: any = await verifyToken(token, options);
      req.auth = { userId: verified?.sub };
      return true;
    } catch (e) {
      throw new UnauthorizedException('Invalid authentication token');
    }
  }
}




