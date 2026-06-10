import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetUser } from '../auth/get-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';
import { ChatStreamDto } from './dto/chat-stream.dto';

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * SSE endpoint for streaming chat responses.
   * Client must POST with question in body; receives sources, chunk, and done events.
   */
  @Post('stream')
  @Sse()
  streamChat(
    @Body() dto: ChatStreamDto,
    @GetUser() user: AuthUser,
  ): Observable<MessageEvent> {
    return this.chatService.streamChat(dto, user);
  }

  @Get('conversations')
  getConversations(@GetUser() user: AuthUser) {
    return this.chatService.getConversations(user);
  }

  @Get('conversations/:id/messages')
  getMessages(@Param('id') id: string, @GetUser() user: AuthUser) {
    return this.chatService.getMessages(id, user);
  }
}
