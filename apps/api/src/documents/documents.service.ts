import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { RagService } from '../rag/rag.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { Document } from '@docbase/types';

@Injectable()
export class DocumentsService {
  constructor(
    private supabaseService: SupabaseService,
    private ragService: RagService,
  ) {}

  async findAll(userId: string, jwt: string): Promise<Document[]> {
    const client = this.supabaseService.getAuthClient(jwt);
    const { data, error } = await client
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data as Document[];
  }

  async findOne(id: string, userId: string, jwt: string): Promise<Document> {
    const client = this.supabaseService.getAuthClient(jwt);
    const { data, error } = await client
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException('Document not found');
    return data as Document;
  }

  async create(dto: CreateDocumentDto, userId: string, jwt: string): Promise<Document> {
    const client = this.supabaseService.getAuthClient(jwt);
    const { data, error } = await client
      .from('documents')
      .insert({ ...dto, user_id: userId })
      .select()
      .single();

    if (error || !data) throw new Error(error?.message ?? 'Failed to create document');

    const doc = data as Document;

    // Trigger async indexing — do not await
    this.ragService.indexDocument(doc.id, doc.content, userId, jwt).catch((err) => {
      console.error(`Failed to index document ${doc.id}:`, err);
    });

    return doc;
  }

  async update(
    id: string,
    dto: UpdateDocumentDto,
    userId: string,
    jwt: string,
  ): Promise<Document> {
    const client = this.supabaseService.getAuthClient(jwt);
    const { data, error } = await client
      .from('documents')
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw new NotFoundException('Document not found');

    const doc = data as Document;

    // Re-index if content changed
    if (dto.content) {
      this.ragService.indexDocument(doc.id, doc.content, userId, jwt).catch((err) => {
        console.error(`Failed to re-index document ${doc.id}:`, err);
      });
    }

    return doc;
  }

  async remove(id: string, userId: string, jwt: string): Promise<void> {
    const client = this.supabaseService.getAuthClient(jwt);
    const { error } = await client.from('documents').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
}
