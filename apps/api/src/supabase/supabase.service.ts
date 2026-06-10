import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly supabaseUrl: string;
  private readonly anonKey: string;
  private readonly serviceRoleKey: string;
  private adminClient: SupabaseClient;

  constructor(private configService: ConfigService) {
    this.supabaseUrl = this.configService.getOrThrow<string>('SUPABASE_URL');
    this.anonKey = this.configService.getOrThrow<string>('SUPABASE_ANON_KEY');
    this.serviceRoleKey = this.configService.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');

    this.adminClient = createClient(this.supabaseUrl, this.serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  /**
   * Admin client with service role key — bypasses RLS.
   * Use only for internal operations (indexing, migrations, etc.)
   */
  getAdminClient(): SupabaseClient {
    return this.adminClient;
  }

  /**
   * Auth client scoped to the user's JWT — RLS applies.
   * Use for all user-facing queries.
   */
  getAuthClient(jwt: string): SupabaseClient {
    return createClient(this.supabaseUrl, this.anonKey, {
      global: {
        headers: { Authorization: `Bearer ${jwt}` },
      },
      auth: { persistSession: false },
    });
  }
}
