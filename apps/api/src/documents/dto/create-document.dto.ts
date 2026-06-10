import { IsString, IsArray, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDocumentDto {
  @ApiProperty({ description: 'Document title', example: 'Getting Started Guide' })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty({ description: 'Document content (markdown supported)' })
  @IsString()
  @MinLength(1)
  content!: string;

  @ApiPropertyOptional({ description: 'Tags for categorization', example: ['guide', 'onboarding'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}
