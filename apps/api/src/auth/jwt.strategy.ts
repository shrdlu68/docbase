import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;
  email: string;
  aud: string;
  role: string;
}

export interface AuthUser {
  userId: string;
  email: string;
  jwt: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    // Support both ES256 (new Supabase local) and HS256 (older/cloud)
    const publicKey = configService.get<string>('SUPABASE_JWT_PUBLIC_KEY');
    const secret = configService.getOrThrow<string>('SUPABASE_JWT_SECRET');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: publicKey
        ? Buffer.from(publicKey.replace(/\\n/g, '\n'))
        : secret,
      algorithms: publicKey ? ['ES256'] : ['HS256'],
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload): AuthUser {
    const authHeader = ((req.headers as unknown) as Record<string, string>)['authorization'];
    const jwt = authHeader?.replace('Bearer ', '') ?? '';
    return {
      userId: payload.sub,
      email: payload.email,
      jwt,
    };
  }
}
