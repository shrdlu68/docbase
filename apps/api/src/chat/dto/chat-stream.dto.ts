import { IsString, IsUUID, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatStreamDto {
  @ApiPropertyOptional({ description: 'Existing conversation ID to continue' })
  @IsUUID()
  @IsOptional()
  conversationId?: string;

  @ApiProperty({ description: 'User question', example: 'What is the refund policy?' })
  @IsString()
  @MinLength(1)
  question!: string;
}
