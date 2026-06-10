import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { SupabaseService } from '../supabase/supabase.service';
import { RagService } from '../rag/rag.service';

const mockDoc = {
  id: 'doc-1',
  user_id: 'user-1',
  title: 'Test Document',
  content: 'Test content',
  tags: ['test'],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const createMockQuery = (returnData: unknown, returnError: unknown = null) => ({
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: returnData, error: returnError }),
  order: jest.fn().mockResolvedValue({ data: returnData, error: returnError }),
});

describe('DocumentsService', () => {
  let service: DocumentsService;
  let mockAuthClient: ReturnType<typeof createMockQuery>;

  const mockSupabaseService = {
    getAuthClient: jest.fn(),
    getAdminClient: jest.fn(),
  };

  const mockRagService = {
    indexDocument: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    mockAuthClient = createMockQuery([mockDoc]);
    mockSupabaseService.getAuthClient.mockReturnValue({
      from: jest.fn().mockReturnValue(mockAuthClient),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: RagService, useValue: mockRagService },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('returns documents ordered by created_at desc', async () => {
      const result = await service.findAll('user-1', 'jwt');
      expect(result).toEqual([mockDoc]);
    });
  });

  describe('findOne', () => {
    it('returns a document by id', async () => {
      mockAuthClient.single.mockResolvedValueOnce({ data: mockDoc, error: null });
      const result = await service.findOne('doc-1', 'user-1', 'jwt');
      expect(result).toEqual(mockDoc);
    });

    it('throws NotFoundException when document not found', async () => {
      mockAuthClient.single.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });
      await expect(service.findOne('bad-id', 'user-1', 'jwt')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a document and triggers indexing', async () => {
      const dto = { title: 'New Doc', content: 'Content', tags: ['tag'] };
      mockAuthClient.single.mockResolvedValueOnce({ data: { ...mockDoc, ...dto }, error: null });

      const result = await service.create(dto, 'user-1', 'jwt');

      expect(result.title).toBe('New Doc');
      // Indexing is triggered but not awaited — wait for it
      await new Promise((r) => setTimeout(r, 10));
      expect(mockRagService.indexDocument).toHaveBeenCalledWith(
        result.id,
        result.content,
        'user-1',
        'jwt',
      );
    });
  });

  describe('remove', () => {
    it('deletes a document', async () => {
      const deleteQuery = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };
      mockSupabaseService.getAuthClient.mockReturnValueOnce({
        from: jest.fn().mockReturnValue(deleteQuery),
      });

      await expect(service.remove('doc-1', 'user-1', 'jwt')).resolves.not.toThrow();
    });
  });
});
