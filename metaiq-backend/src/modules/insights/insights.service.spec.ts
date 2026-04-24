import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InsightsService } from './insights.service';
import { MetricsService } from '../metrics/metrics.service';
import { Insight } from './insight.entity';
import { Campaign } from '../campaigns/campaign.entity';
import { AccessScopeService } from '../../common/services/access-scope.service';

describe('InsightsService', () => {
  let service: InsightsService;

  const mockInsightRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    findOneOrFail: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockMetricsService = {
    getCampaignSummaryForSystemJob: jest.fn(),
  };

  const mockAccessScopeService = {
    applyCampaignScope: jest.fn(async (query) => query),
    applyInsightScope: jest.fn(async (query) => query),
    validateInsightAccess: jest.fn(),
    validateCampaignAccess: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InsightsService,
        {
          provide: getRepositoryToken(Insight),
          useValue: mockInsightRepo,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        {
          provide: AccessScopeService,
          useValue: mockAccessScopeService,
        },
      ],
    }).compile();

    service = module.get<InsightsService>(InsightsService);

    mockInsightRepo.create.mockImplementation((payload) => payload);
    mockInsightRepo.save.mockImplementation(async (payload) => ({
      id: 'saved-insight',
      ...payload,
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateForCampaign', () => {
    const mockCampaign: Campaign = {
      id: 'camp-123',
      name: 'Test Campaign',
      metaId: 'meta_123',
      externalId: null,
      status: 'ACTIVE',
      objective: 'CONVERSIONS',
      dailyBudget: 100,
      score: 0,
      startTime: new Date('2026-01-01'),
      endTime: null,
      lastSeenAt: null,
      userId: 'user-123',
      storeId: 'store-123',
      createdByUserId: 'user-123',
      adAccountId: 'acc-123',
      user: {} as any,
      store: {} as any,
      createdBy: {} as any,
      adAccount: {} as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should generate no insights when metrics are unavailable', async () => {
      mockMetricsService.getCampaignSummaryForSystemJob.mockResolvedValue(null);

      const result = await service.generateForCampaign(mockCampaign);

      expect(result).toEqual([]);
      expect(mockMetricsService.getCampaignSummaryForSystemJob).toHaveBeenCalled();
    });

    it('should generate ROAS danger insight when ROAS < 1.0', async () => {
      const mockSummary = {
        totalSpend: 100,
        impressions: 5000,
        clicks: 100,
        conversions: 10,
        totalRevenue: 80,
        ctr: 2.0,
        cpa: 10,
        roas: 0.8, // Below 1.0 → danger
        avgCtr: 2.0,
        avgCpa: 10,
        avgRoas: 0.8,
        lastMetricDate: new Date().toISOString().split('T')[0],
      };

      mockMetricsService.getCampaignSummaryForSystemJob.mockResolvedValue(mockSummary);
      mockInsightRepo.findOne.mockResolvedValue(null); // No duplicate

      const result = await service.generateForCampaign(mockCampaign);

      const roasInsight = result.find(i => i.message.includes('ROAS'));
      expect(roasInsight).toBeDefined();
      expect(roasInsight?.severity).toBe('danger');
      expect(roasInsight?.type).toBe('alert');
    });

    it('should generate CTR danger insight when CTR < 0.5%', async () => {
      const mockSummary = {
        totalSpend: 100,
        impressions: 10000,
        clicks: 30, // 0.3% CTR → danger
        conversions: 5,
        totalRevenue: 150,
        ctr: 0.3,
        cpa: 20,
        roas: 1.5,
        avgCtr: 0.3,
        avgCpa: 20,
        avgRoas: 1.5,
        lastMetricDate: new Date().toISOString().split('T')[0],
      };

      mockMetricsService.getCampaignSummaryForSystemJob.mockResolvedValue(mockSummary);
      mockInsightRepo.findOne.mockResolvedValue(null);

      const result = await service.generateForCampaign(mockCampaign);

      expect(result.length).toBeGreaterThan(0);
      const ctrInsight = result.find(i => i.message.includes('CTR'));
      expect(ctrInsight).toBeDefined();
      expect(ctrInsight?.severity).toBe('danger');
    });

    it('should generate opportunity insight when ROAS > 4.0', async () => {
      const mockSummary = {
        totalSpend: 100,
        impressions: 5000,
        clicks: 150,
        conversions: 30,
        totalRevenue: 450,
        ctr: 3.0,
        cpa: 3.33,
        roas: 4.5, // Above 4.0 → opportunity
        avgCtr: 3.0,
        avgCpa: 3.33,
        avgRoas: 4.5,
        lastMetricDate: new Date().toISOString().split('T')[0],
      };

      mockMetricsService.getCampaignSummaryForSystemJob.mockResolvedValue(mockSummary);
      mockInsightRepo.findOne.mockResolvedValue(null);

      const result = await service.generateForCampaign(mockCampaign);

      expect(result.length).toBeGreaterThan(0);
      const opportunityInsight = result.find(i => i.message.includes('ROAS'));
      expect(opportunityInsight).toBeDefined();
      expect(opportunityInsight?.severity).toBe('success');
    });

    it('should not duplicate existing insights', async () => {
      const mockSummary = {
        totalSpend: 100,
        impressions: 5000,
        clicks: 100,
        conversions: 10,
        totalRevenue: 80,
        ctr: 2.0,
        cpa: 10,
        roas: 0.8,
        avgCtr: 2.0,
        avgCpa: 10,
        avgRoas: 0.8,
        lastMetricDate: new Date().toISOString().split('T')[0],
      };

      mockMetricsService.getCampaignSummaryForSystemJob.mockResolvedValue(mockSummary);

      const existingInsight = {
        id: 'existing-insight',
        type: 'alert',
        severity: 'danger',
        resolved: false,
      };

      // First rule generates duplicate, rest generate new
      mockInsightRepo.findOne
        .mockResolvedValueOnce(existingInsight) // Duplicate found for first rule
        .mockResolvedValue(null); // No duplicates for other rules

      const mockNewInsight = {
        id: 'new-insight',
        campaignId: mockCampaign.id,
        type: 'alert',
        severity: 'warning',
        resolved: false,
      };

      mockInsightRepo.create.mockReturnValue(mockNewInsight);
      mockInsightRepo.save.mockResolvedValue(mockNewInsight);

      const result = await service.generateForCampaign(mockCampaign);

      // Should not include the duplicate
      expect(result.every(i => i.id !== 'existing-insight')).toBe(true);
    });
  });

  describe('resolveInsight', () => {
    it('should mark insight as resolved', async () => {
      const mockInsight: Insight = {
        id: 'insight-123',
        campaignId: 'camp-123',
        campaign: {} as any,
        type: 'alert',
        severity: 'warning',
        message: 'Test message',
        recommendation: 'Test recommendation',
        resolved: false,
        priority: 'medium',
        lastTriggeredAt: undefined,
        cooldownInHours: 0,
        ruleVersion: 1,
        detectedAt: new Date(),
        updatedAt: new Date(),
      };

      const resolvedInsight = { ...mockInsight, resolved: true };

      mockInsightRepo.findOneOrFail.mockResolvedValue(mockInsight);
      mockInsightRepo.save.mockResolvedValue(resolvedInsight);

      mockAccessScopeService.validateInsightAccess.mockResolvedValue(mockInsight);
      const result = await service.resolveForUser({ id: 'user-1' } as any, 'insight-123');

      expect(result.resolved).toBe(true);
      expect(mockInsightRepo.save).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should find all insights with filters', async () => {
      const mockInsights = [
        {
          id: 'insight-1',
          campaignId: 'camp-123',
          type: 'alert',
          severity: 'danger',
          resolved: false,
        },
      ];

      const mockQueryBuilder = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockInsights),
      };

      mockInsightRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const mockUser = { id: 'user-1', role: 'ADMIN', tenantId: 'tenant-1' } as any;
      mockAccessScopeService.validateCampaignAccess.mockResolvedValue(undefined);
      const result = await service.findAllForUser(mockUser, {
        campaignId: 'camp-123',
        resolved: false,
      });

      expect(result).toEqual(mockInsights);
      expect(mockQueryBuilder.getMany).toHaveBeenCalled();
    });
  });

  describe('deleteOldResolved', () => {
    it('should delete resolved insights older than specified days', async () => {
      const mockQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 5 }),
      };

      mockInsightRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.deleteOldResolved(30);

      expect(mockQueryBuilder.execute).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'resolved = :resolved',
        { resolved: true }
      );
    });
  });
});
