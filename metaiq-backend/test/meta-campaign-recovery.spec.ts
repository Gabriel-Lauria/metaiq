import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { MetaCampaignRecoveryService } from '../src/modules/integrations/meta/meta-campaign-recovery.service';
import { MetaCampaignOrchestrator } from '../src/modules/integrations/meta/meta-campaign.orchestrator';
import { MetaGraphApiClient } from '../src/modules/integrations/meta/meta-graph-api.client';
import { MetaCampaignCreation, MetaCampaignCreationStatus } from '../src/modules/integrations/meta/meta-campaign-creation.entity';
import { CreateMetaCampaignDto } from '../src/modules/integrations/meta/dto/meta-integration.dto';

describe('MetaCampaignRecoveryService', () => {
  let service: MetaCampaignRecoveryService;
  let campaignCreationRepository: Repository<MetaCampaignCreation>;
  let orchestrator: MetaCampaignOrchestrator;
  let graphApi: MetaGraphApiClient;

  const mockExecutionId = 'exec-123';
  const mockAccessToken = 'token-123';
  const mockAdAccountId = 'act_123456789';

  const mockExecution: MetaCampaignCreation = {
    id: mockExecutionId,
    idempotencyKey: 'key-123',
    status: MetaCampaignCreationStatus.PARTIAL,
    errorStep: 'adset',
    errorMessage: 'Budget insuficiente',
    metaCampaignId: '120245670684470319',
    metaAdSetId: null,
    metaCreativeId: null,
    metaAdId: null,
    storeId: 'store-1',
    adAccountId: 'acc-1',
    store: null,
    adAccount: null,
    campaign: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as MetaCampaignCreation;

  const mockDto: CreateMetaCampaignDto = {
    name: 'Test Campaign',
    objective: 'CONVERSIONS',
    dailyBudget: 100,
    country: 'BR',
    adAccountId: 'acc-1',
    message: 'Test message',
    imageUrl: 'https://example.com/image.jpg',
    destinationUrl: 'https://example.com',
    initialStatus: 'PAUSED',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaCampaignRecoveryService,
        {
          provide: getRepositoryToken(MetaCampaignCreation),
          useValue: {
            findOneBy: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: MetaCampaignOrchestrator,
          useValue: {
            resumeCreation: jest.fn(),
          },
        },
        {
          provide: MetaGraphApiClient,
          useValue: {
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MetaCampaignRecoveryService>(MetaCampaignRecoveryService);
    campaignCreationRepository = module.get<Repository<MetaCampaignCreation>>(
      getRepositoryToken(MetaCampaignCreation),
    );
    orchestrator = module.get<MetaCampaignOrchestrator>(MetaCampaignOrchestrator);
    graphApi = module.get<MetaGraphApiClient>(MetaGraphApiClient);
  });

  describe('retryPartialCampaignCreation', () => {
    it('should return success if execution is already ACTIVE', async () => {
      const activeExecution: MetaCampaignCreation = {
        ...mockExecution,
        status: MetaCampaignCreationStatus.ACTIVE,
        metaAdSetId: 'adset-123',
        metaCreativeId: 'creative-123',
        metaAdId: 'ad-123',
      } as MetaCampaignCreation;

      jest.spyOn(campaignCreationRepository, 'findOneBy').mockResolvedValue(activeExecution);

      const result = await service.retryPartialCampaignCreation(
        mockExecutionId,
        mockAccessToken,
        mockAdAccountId,
        mockDto,
        'page-123',
        'https://example.com',
        'CONVERSIONS',
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('completada');
      expect(result.ids).toEqual({
        campaignId: activeExecution.metaCampaignId,
        adSetId: activeExecution.metaAdSetId,
        creativeId: activeExecution.metaCreativeId,
        adId: activeExecution.metaAdId,
      });
    });

    it('should throw CONFLICT error if execution is CREATING', async () => {
      const creatingExecution: MetaCampaignCreation = {
        ...mockExecution,
        status: MetaCampaignCreationStatus.CREATING,
      } as MetaCampaignCreation;

      jest.spyOn(campaignCreationRepository, 'findOneBy').mockResolvedValue(creatingExecution);

      await expect(
        service.retryPartialCampaignCreation(
          mockExecutionId,
          mockAccessToken,
          mockAdAccountId,
          mockDto,
          'page-123',
          'https://example.com',
          'CONVERSIONS',
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw BadRequest error if execution is FAILED', async () => {
      const failedExecution: MetaCampaignCreation = {
        ...mockExecution,
        status: MetaCampaignCreationStatus.FAILED,
      } as MetaCampaignCreation;

      jest.spyOn(campaignCreationRepository, 'findOneBy').mockResolvedValue(failedExecution);

      await expect(
        service.retryPartialCampaignCreation(
          mockExecutionId,
          mockAccessToken,
          mockAdAccountId,
          mockDto,
          'page-123',
          'https://example.com',
          'CONVERSIONS',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully resume and complete PARTIAL execution', async () => {
      const completedIds = {
        campaignId: '120245670684470319',
        adSetId: '23842705685680319',
        creativeId: '120245670684470320',
        adId: '120245670684470321',
      };

      jest.spyOn(campaignCreationRepository, 'findOneBy').mockResolvedValue(mockExecution);
      jest.spyOn(orchestrator, 'resumeCreation').mockResolvedValue(completedIds as any);
      jest.spyOn(campaignCreationRepository, 'save').mockResolvedValue(mockExecution);

      const result = await service.retryPartialCampaignCreation(
        mockExecutionId,
        mockAccessToken,
        mockAdAccountId,
        mockDto,
        'page-123',
        'https://example.com',
        'CONVERSIONS',
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('retomada');
      expect(result.ids).toEqual(completedIds);
      expect(campaignCreationRepository.save).toHaveBeenCalled();
    });

    it('should throw error if execution not found', async () => {
      jest.spyOn(campaignCreationRepository, 'findOneBy').mockResolvedValue(null);

      await expect(
        service.retryPartialCampaignCreation(
          'non-existent',
          mockAccessToken,
          mockAdAccountId,
          mockDto,
          'page-123',
          'https://example.com',
          'CONVERSIONS',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cleanupPartialResources', () => {
    it('should successfully cleanup partial resources', async () => {
      jest.spyOn(campaignCreationRepository, 'findOneBy').mockResolvedValue(mockExecution);
      jest.spyOn(graphApi, 'delete').mockResolvedValue({ success: true });
      jest.spyOn(campaignCreationRepository, 'save').mockResolvedValue(mockExecution);

      const result = await service.cleanupPartialResources(
        mockExecutionId,
        mockAccessToken,
        mockAdAccountId,
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Limpeza');
      expect(graphApi.delete).toHaveBeenCalledWith(
        `${mockAdAccountId}/campaigns/${mockExecution.metaCampaignId}`,
        mockAccessToken,
      );
    });

    it('should remove resources in reverse order (ad -> creative -> adset -> campaign)', async () => {
      const fullExecution: MetaCampaignCreation = {
        ...mockExecution,
        metaAdSetId: 'adset-123',
        metaCreativeId: 'creative-123',
        metaAdId: 'ad-123',
      } as MetaCampaignCreation;

      jest.spyOn(campaignCreationRepository, 'findOneBy').mockResolvedValue(fullExecution);
      jest.spyOn(graphApi, 'delete').mockResolvedValue({ success: true });
      jest.spyOn(campaignCreationRepository, 'save').mockResolvedValue(fullExecution);

      const result = await service.cleanupPartialResources(
        mockExecutionId,
        mockAccessToken,
        mockAdAccountId,
      );

      expect(result.success).toBe(true);
      expect(result.cleaned.ad).toBe(true);
      expect(result.cleaned.creative).toBe(true);
      expect(result.cleaned.adset).toBe(true);
      expect(result.cleaned.campaign).toBe(true);

      // Verify order of deletion calls
      const deleteCalls = (graphApi.delete as jest.Mock).mock.calls;
      expect(deleteCalls[0][0]).toContain('/ads/');
      expect(deleteCalls[1][0]).toContain('/adcreatives/');
      expect(deleteCalls[2][0]).toContain('/adsets/');
      expect(deleteCalls[3][0]).toContain('/campaigns/');
    });

    it('should throw error if execution is ACTIVE', async () => {
      const activeExecution: MetaCampaignCreation = {
        ...mockExecution,
        status: MetaCampaignCreationStatus.ACTIVE,
      } as MetaCampaignCreation;

      jest.spyOn(campaignCreationRepository, 'findOneBy').mockResolvedValue(activeExecution);

      await expect(
        service.cleanupPartialResources(mockExecutionId, mockAccessToken, mockAdAccountId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error if execution not found', async () => {
      jest.spyOn(campaignCreationRepository, 'findOneBy').mockResolvedValue(null);

      await expect(
        service.cleanupPartialResources(mockExecutionId, mockAccessToken, mockAdAccountId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getExecutionStatus', () => {
    it('should return execution status with partial IDs', async () => {
      jest.spyOn(campaignCreationRepository, 'findOne').mockResolvedValue(mockExecution);

      const result = await service.getExecutionStatus(mockExecutionId);

      expect(result.id).toBe(mockExecutionId);
      expect(result.status).toBe(MetaCampaignCreationStatus.PARTIAL);
      expect(result.step).toBe('adset');
      expect(result.partialIds.campaign).toBe('120245670684470319');
      expect(result.partialIds.adset).toBeNull();
    });

    it('should throw error if execution not found', async () => {
      jest.spyOn(campaignCreationRepository, 'findOne').mockResolvedValue(null);

      await expect(service.getExecutionStatus(mockExecutionId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
