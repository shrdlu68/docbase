import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface AuthUser {
  userId: string;
  email: string;
  jwt: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      user: AuthUser;
    }>();

    const authHeader = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }

    const token = authHeader.slice(7);
    const {
      data: { user },
      error,
    } = await this.supabase.getAdminClient().auth.getUser(token);

    if (error || !user) {
      throw new UnauthorizedException();
    }

    request.user = { userId: user.id, email: user.email ?? '', jwt: token };
    return true;
  }
}
