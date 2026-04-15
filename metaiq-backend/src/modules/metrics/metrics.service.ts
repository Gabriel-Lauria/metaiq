import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetricDaily } from './metric-daily.entity';
import { MetricsEngine } from './metrics.engine';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { calcCTR, calcCPA, calcROAS } from '../../common/utils/metrics.util';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AccessScopeService } from '../../common/services/access-scope.service';

@Injectable()
export class MetricsService {
  constructor(
    @InjectRepository(MetricDaily)
    private metricRepository: Repository<MetricDaily>,
    private readonly accessScope: AccessScopeService,
  ) {}

  private engine = new MetricsEngine();

  async findAll(): Promise<MetricDaily[]> {
    return this.metricRepository.find({
      relations: ['campaign'],
      order: { date: 'DESC' },
    });
  }

  async findByCampaign(campaignId: string): Promise<MetricDaily[]> {
    return this.metricRepository.find({
      where: { campaign: { id: campaignId } },
      relations: ['campaign'],
      order: { date: 'DESC' },
    });
  }

  async getSummary(user: AuthenticatedUser, from: Date, to: Date): Promise<any> {
    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];

    // Use SQL aggregation with userId filter to prevent data leakage
    const query = this.metricRepository
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.campaign', 'campaign')
      .select([
        'SUM(m.impressions) as impressions',
        'SUM(m.clicks) as clicks',
        'SUM(m.spend) as spend',
        'SUM(m.conversions) as conversions',
        'SUM(m.revenue) as revenue',
      ])
      .where('m.date BETWEEN :from AND :to', { from: fromStr, to: toStr });

    const result = await this.accessScope
      .applyCampaignScope(query, user)
      .getRawOne();

    if (!result) {
      return {
        impressions: 0,
        clicks: 0,
        spend: 0,
        conversions: 0,
        revenue: 0,
        ctr: 0,
        cpa: 0,
        roas: 0,
        score: 0,
        totalSpend: 0,
        totalRevenue: 0,
        avgRoas: 0,
        avgCpa: 0,
        avgCtr: 0,
      };
    }

    const totalImpressions = Number(result.impressions) || 0;
    const totalClicks = Number(result.clicks) || 0;
    const totalSpend = Number(result.spend) || 0;
    const totalConversions = Number(result.conversions) || 0;
    const totalRevenue = Number(result.revenue) || 0;
    const ctr = calcCTR(totalClicks, totalImpressions);
    const cpa = calcCPA(totalSpend, totalConversions);
    const roas = calcROAS(totalRevenue, totalSpend);

    const computed = this.engine.compute({
      impressions: totalImpressions,
      clicks: totalClicks,
      spend: totalSpend,
      conversions: totalConversions,
      revenue: totalRevenue,
    });

    return {
      impressions: totalImpressions,
      clicks: totalClicks,
      spend: totalSpend,
      conversions: totalConversions,
      revenue: totalRevenue,
      ctr,
      cpa,
      roas,
      score: computed.score,
      totalSpend,
      totalRevenue,
      avgRoas: roas,
      avgCpa: cpa,
      avgCtr: ctr,
    };
  }

  async findAllPaginated(user: AuthenticatedUser, pagination: PaginationDto): Promise<PaginatedResponse<MetricDaily>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    // Filter metrics by user's campaigns to prevent data leakage
    const query = this.metricRepository
      .createQueryBuilder('m')
      .innerJoin('m.campaign', 'campaign')
      .addSelect('campaign.id')
      .orderBy('m.date', 'DESC')
      .skip(skip)
      .take(limit);

    const [data, total] = await this.accessScope.applyCampaignScope(query, user).getManyAndCount();

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async getCampaignSummary(campaignId: string, from: string, to: string): Promise<any> {
    const result = await this.metricRepository
      .createQueryBuilder('m')
      .select([
        'SUM(m.impressions) as impressions',
        'SUM(m.clicks) as clicks',
        'SUM(m.spend) as spend',
        'SUM(m.conversions) as conversions',
        'SUM(m.revenue) as revenue',
        'AVG(m.ctr) as ctr',
        'AVG(m.cpa) as cpa',
        'AVG(m.roas) as roas',
        'MAX(m.date) as lastMetricDate',
      ])
      .where('m.campaignId = :campaignId', { campaignId })
      .andWhere('m.date BETWEEN :from AND :to', { from, to })
      .getRawOne();

    if (!result) {
      return null;
    }

    const totalSpend = Number(result.spend) || 0;
    const totalRevenue = Number(result.revenue) || 0;
    const totalClicks = Number(result.clicks) || 0;
    const totalImpressions = Number(result.impressions) || 0;
    const totalConversions = Number(result.conversions) || 0;

    return {
      ...result,
      totalSpend,
      totalRevenue,
      lastMetricDate: result.lastMetricDate,
      avgCtr: calcCTR(totalClicks, totalImpressions),
      avgCpa: calcCPA(totalSpend, totalConversions),
      avgRoas: calcROAS(totalRevenue, totalSpend),
    };
  }

  async getCampaignSummaryForUser(
    user: AuthenticatedUser,
    campaignId: string,
    from: string,
    to: string,
  ): Promise<any> {
    const query = this.metricRepository
      .createQueryBuilder('m')
      .innerJoin('m.campaign', 'campaign')
      .select([
        'SUM(m.impressions) as impressions',
        'SUM(m.clicks) as clicks',
        'SUM(m.spend) as spend',
        'SUM(m.conversions) as conversions',
        'SUM(m.revenue) as revenue',
        'AVG(m.ctr) as ctr',
        'AVG(m.cpa) as cpa',
        'AVG(m.roas) as roas',
        'MAX(m.date) as lastMetricDate',
      ])
      .where('m.campaignId = :campaignId', { campaignId })
      .andWhere('m.date BETWEEN :from AND :to', { from, to });

    const result = await this.accessScope.applyCampaignScope(query, user).getRawOne();

    if (!result) {
      return null;
    }

    const totalSpend = Number(result.spend) || 0;
    const totalRevenue = Number(result.revenue) || 0;
    const totalClicks = Number(result.clicks) || 0;
    const totalImpressions = Number(result.impressions) || 0;
    const totalConversions = Number(result.conversions) || 0;

    return {
      impressions: totalImpressions,
      clicks: totalClicks,
      spend: totalSpend,
      conversions: totalConversions,
      revenue: totalRevenue,
      ctr: calcCTR(totalClicks, totalImpressions),
      cpa: calcCPA(totalSpend, totalConversions),
      roas: calcROAS(totalRevenue, totalSpend),
      totalSpend,
      totalRevenue,
      lastMetricDate: result.lastMetricDate,
      avgCtr: calcCTR(totalClicks, totalImpressions),
      avgCpa: calcCPA(totalSpend, totalConversions),
      avgRoas: calcROAS(totalRevenue, totalSpend),
    };
  }

  async findByCampaignForUser(
    user: AuthenticatedUser,
    campaignId: string,
    from: string,
    to: string,
  ): Promise<MetricDaily[]> {
    const query = this.metricRepository
      .createQueryBuilder('m')
      .innerJoin('m.campaign', 'campaign')
      .where('m.campaignId = :campaignId', { campaignId })
      .andWhere('m.date BETWEEN :from AND :to', { from, to })
      .orderBy('m.date', 'DESC');

    return this.accessScope.applyCampaignScope(query, user).getMany();
  }

  async upsertDailyMetric(data: Partial<MetricDaily>): Promise<MetricDaily> {
    const existing = await this.metricRepository.findOne({
      where: { campaign: { id: data.campaignId }, date: data.date },
    });

    const enriched = {
      ...data,
      ctr: calcCTR(data.clicks ?? 0, data.impressions ?? 0),
      cpa: calcCPA(data.spend ?? 0, data.conversions ?? 0),
      roas: calcROAS(data.revenue ?? 0, data.spend ?? 0),
    } as Partial<MetricDaily>;

    if (existing) {
      Object.assign(existing, enriched);
      return this.metricRepository.save(existing);
    }

    return this.metricRepository.save(this.metricRepository.create(enriched));
  }

  async findByCampaignPaginated(user: AuthenticatedUser, campaignId: string, pagination: PaginationDto): Promise<PaginatedResponse<MetricDaily>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const query = this.metricRepository
      .createQueryBuilder('m')
      .innerJoin('m.campaign', 'campaign')
      .where('campaign.id = :campaignId', { campaignId })
      .orderBy('m.date', 'DESC')
      .skip(skip)
      .take(limit);

    const [data, total] = await this.accessScope.applyCampaignScope(query, user).getManyAndCount();

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }
}
