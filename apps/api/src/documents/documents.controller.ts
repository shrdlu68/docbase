import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetUser } from '../auth/get-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  findAll(@GetUser() user: AuthUser) {
    return this.documentsService.findAll(user.userId, user.jwt);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @GetUser() user: AuthUser) {
    return this.documentsService.findOne(id, user.userId, user.jwt);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateDocumentDto, @GetUser() user: AuthUser) {
    return this.documentsService.create(dto, user.userId, user.jwt);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
    @GetUser() user: AuthUser,
  ) {
    return this.documentsService.update(id, dto, user.userId, user.jwt);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @GetUser() user: AuthUser) {
    return this.documentsService.remove(id, user.userId, user.jwt);
  }
}
