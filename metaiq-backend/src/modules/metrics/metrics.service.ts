import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { MetricDaily } from './metric-daily.entity';
import { MetricsEngine } from './metrics.engine';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { calcCTR, calcCPA, calcROAS } from '../../common/utils/metrics.util';

@Injectable()
export class MetricsService {
  constructor(
    @InjectRepository(MetricDaily)
    private metricRepository: Repository<MetricDaily>,
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

  async getSummary(from: Date, to: Date): Promise<any> {
    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];

    // Use SQL aggregation instead of loading all records in memory
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
        'AVG(m.roas) as roas'
      ])
      .where('m.date BETWEEN :from AND :to', { from: fromStr, to: toStr })
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

    const computed = this.engine.compute({
      impressions: Number(result.impressions) || 0,
      clicks: Number(result.clicks) || 0,
      spend: Number(result.spend) || 0,
      conversions: Number(result.conversions) || 0,
      revenue: Number(result.revenue) || 0,
    });

    return {
      impressions: Number(result.impressions) || 0,
      clicks: Number(result.clicks) || 0,
      spend: Number(result.spend) || 0,
      conversions: Number(result.conversions) || 0,
      revenue: Number(result.revenue) || 0,
      ctr: Number(result.ctr) || 0,
      cpa: Number(result.cpa) || 0,
      roas: Number(result.roas) || 0,
      score: computed.score,
      totalSpend: Number(result.spend) || 0,
      totalRevenue: Number(result.revenue) || 0,
      avgRoas: Number(result.roas) || 0,
      avgCpa: Number(result.cpa) || 0,
      avgCtr: Number(result.ctr) || 0,
    };
  }

  async findAllPaginated(pagination: PaginationDto): Promise<PaginatedResponse<MetricDaily>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await this.metricRepository.findAndCount({
      relations: ['campaign'],
      order: { date: 'DESC' },
      skip,
      take: limit,
    });

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

  async findByCampaignPaginated(campaignId: string, pagination: PaginationDto): Promise<PaginatedResponse<MetricDaily>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await this.metricRepository.findAndCount({
      where: { campaign: { id: campaignId } },
      relations: ['campaign'],
      order: { date: 'DESC' },
      skip,
      take: limit,
    });

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