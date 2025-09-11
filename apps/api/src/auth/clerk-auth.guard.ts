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
        issuer: (iss) => iss.startsWith('https://clerk.') || iss.includes('.clerk.accounts'),
      });
      
      if (!payload.sub) {
        throw new UnauthorizedException('Invalid token payload');
      }

      // Agregar información del usuario al request
      // Por ahora solo usamos la información del token
      request.user = {
        userId: payload.sub,
        // Otros campos se pueden obtener del token o hacer una llamada adicional si es necesario
      };

      return true;
    } catch (error) {
      throw new UnauthorizedException(
        'Invalid authentication token: ' + error.message,
      );
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
