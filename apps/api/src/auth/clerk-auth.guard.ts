import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { verifyToken } from '@clerk/backend';
import { ConfigService } from '@nestjs/config';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    emailAddress?: string;
    firstName?: string;
    lastName?: string;
    imageUrl?: string;
    // PR5a (B1.2(a) Vía B): orgId built-in claim from Clerk session token.
    // Clerk emits `org_id` automatically when the user has an active org —
    // no custom session token claim required (compatible with Student plan).
    // tenantId is filled in by TenantContextGuard after lookup.
    orgId?: string;
    tenantId?: string;
  };
}

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {
    // Configurar Clerk client con la clave secreta desde el environment
    // El clerkClient usa automáticamente CLERK_SECRET_KEY del environment
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No authentication token provided');
    }

    try {
      // Verificar el token con Clerk
      const payload = await verifyToken(token, {
        secretKey: this.configService.get<string>('CLERK_SECRET_KEY'),
        issuer: (iss) =>
          iss.startsWith('https://clerk.') || iss.includes('.clerk.accounts'),
      });

      if (!payload.sub) {
        throw new UnauthorizedException('Invalid token payload');
      }

      // Agregar información del usuario al request.
      // `org_id` is a Clerk built-in claim populated when the session has an
      // active organization. Empty string is normalized to undefined so
      // downstream guards can treat "no active org" uniformly.
      const orgId = (payload as { org_id?: string }).org_id;
      request.user = {
        userId: payload.sub,
        orgId: orgId && orgId.length > 0 ? orgId : undefined,
      };

      return true;
    } catch (error) {
      // Log detailed error for debugging (server-side only)
      console.error(
        '[ClerkAuthGuard] Token verification failed:',
        error.message,
      );

      // Return generic message to client (don't expose internal details)
      throw new UnauthorizedException(
        'Invalid or expired authentication token',
      );
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
