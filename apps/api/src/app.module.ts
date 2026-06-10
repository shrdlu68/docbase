import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { DocumentsModule } from './documents/documents.module';
import { RagModule } from './rag/rag.module';
import { AiModule } from './ai/ai.module';
import { ChatModule } from './chat/chat.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        SUPABASE_URL: Joi.string().uri().required(),
        SUPABASE_ANON_KEY: Joi.string().required(),
        SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
        SUPABASE_JWT_SECRET: Joi.string().required(),
        SUPABASE_JWT_PUBLIC_KEY: Joi.string().optional(),
        AI_BASE_URL: Joi.string().uri().default('https://api.openai.com/v1'),
        AI_API_KEY: Joi.string().required(),
        AI_MODEL: Joi.string().default('gpt-4o-mini'),
        EMBEDDING_MODEL: Joi.string().default('text-embedding-ada-002'),
        API_PORT: Joi.number().default(3001),
      }),
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    SupabaseModule,
    AuthModule,
    AiModule,
    RagModule,
    DocumentsModule,
    ChatModule,
    HealthModule,
  ],
})
export class AppModule {}
