import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AccessScopeService } from '../../common/services/access-scope.service';
import { calcCPA, calcCPC, calcCTR, calcROAS } from '../../common/utils/metrics.util';
import { AuthenticatedUser } from '../../common/interfaces';
import { Campaign } from '../campaigns/campaign.entity';
import { Insight } from '../insights/insight.entity';
import { MetricDaily } from '../metrics/metric-daily.entity';
import { Store } from '../stores/store.entity';
import { User } from '../users/user.entity';

interface DashboardSummaryFilters {
  storeId?: string;
  days?: number;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(MetricDaily)
    private readonly metricRepository: Repository<MetricDaily>,
    @InjectRepository(Insight)
    private readonly insightRepository: Repository<Insight>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly accessScope: AccessScopeService,
  ) {}

  async getSummary(user: AuthenticatedUser, filters: DashboardSummaryFilters = {}) {
    const days = filters.days ?? 30;
    const storeId = filters.storeId || undefined;
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - days);
    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];

    if (storeId) {
      await this.accessScope.validateStoreAccess(user, storeId);
    }

    const [metrics, campaignCount, activeCampaignCount, storesCount, usersCount, highlights, insights] =
      await Promise.all([
        this.getMetrics(user, fromStr, toStr, storeId),
        this.countCampaigns(user, storeId),
        this.countCampaigns(user, storeId, 'ACTIVE'),
        this.countStores(user),
        this.countUsers(user),
        this.getCampaignHighlights(user, storeId),
        this.getRecentInsights(user, storeId),
      ]);

    return {
      period: { days, from: fromStr, to: toStr },
      scope: { storeId: storeId ?? null },
      counts: {
        stores: storesCount,
        users: usersCount,
        campaigns: campaignCount,
        activeCampaigns: activeCampaignCount,
      },
      metrics,
      highlights,
      insights,
    };
  }

  private async getMetrics(
    user: AuthenticatedUser,
    from: string,
    to: string,
    storeId?: string,
  ) {
    const query = this.metricRepository
      .createQueryBuilder('metric')
      .innerJoin('metric.campaign', 'campaign')
      .select([
        'SUM(metric.impressions) as impressions',
        'SUM(metric.clicks) as clicks',
        'SUM(metric.spend) as spend',
        'SUM(metric.conversions) as conversions',
        'SUM(metric.revenue) as revenue',
      ])
      .where('metric.date BETWEEN :from AND :to', { from, to });

    await this.accessScope.applyMetricScope(query, 'campaign', user);
    this.applyStoreFilter(query, storeId);

    const result = await query.getRawOne();
    const impressions = Number(result?.impressions) || 0;
    const clicks = Number(result?.clicks) || 0;
    const spend = Number(result?.spend) || 0;
    const conversions = Number(result?.conversions) || 0;
    const revenue = Number(result?.revenue) || 0;

    return {
      impressions,
      clicks,
      spend,
      conversions,
      revenue,
      ctr: calcCTR(clicks, impressions),
      cpc: calcCPC(spend, clicks),
      cpa: calcCPA(spend, conversions),
      roas: calcROAS(revenue, spend),
    };
  }

  private async countCampaigns(
    user: AuthenticatedUser,
    storeId?: string,
    status?: Campaign['status'],
  ): Promise<number> {
    const query = this.campaignRepository.createQueryBuilder('campaign');
    await this.accessScope.applyCampaignScope(query, 'campaign', user);
    this.applyStoreFilter(query, storeId);

    if (status) {
      query.andWhere('campaign.status = :status', { status });
    }

    return query.getCount();
  }

  private async countStores(user: AuthenticatedUser): Promise<number> {
    const storeIds = await this.accessScope.getAllowedStoreIds(user);
    if (storeIds === null) {
      return this.storeRepository.count({ where: { active: true, deletedAt: IsNull() } });
    }

    return storeIds.length;
  }

  private async countUsers(user: AuthenticatedUser): Promise<number> {
    const query = this.userRepository
      .createQueryBuilder('user')
      .where('user.active = :active', { active: true });
    await this.accessScope.applyUserScope(query, 'user', user);
    return query.getCount();
  }

  private async getCampaignHighlights(user: AuthenticatedUser, storeId?: string) {
    const query = this.campaignRepository
      .createQueryBuilder('campaign')
      .leftJoinAndSelect('campaign.store', 'store')
      .select([
        'campaign.id',
        'campaign.name',
        'campaign.status',
        'campaign.score',
        'campaign.storeId',
        'store.id',
        'store.name',
      ])
      .orderBy('campaign.score', 'DESC')
      .take(6);

    await this.accessScope.applyCampaignScope(query, 'campaign', user);
    this.applyStoreFilter(query, storeId);

    const campaigns = await query.getMany();
    return {
      best: campaigns[0] ?? null,
      attention: campaigns.slice().reverse()[0] ?? null,
      campaigns,
    };
  }

  private async getRecentInsights(user: AuthenticatedUser, storeId?: string): Promise<Insight[]> {
    const query = this.insightRepository
      .createQueryBuilder('insight')
      .innerJoinAndSelect('insight.campaign', 'campaign')
      .where('insight.resolved = :resolved', { resolved: false })
      .take(20); // Get more to sort in memory

    await this.accessScope.applyInsightScope(query, 'campaign', user);
    this.applyStoreFilter(query, storeId);

    const insights = await query.getMany();

    // Sort by severity priority, then by detectedAt
    const severityOrder = { danger: 1, warning: 2, success: 3, info: 4 };
    return insights
      .sort((a, b) => {
        const aSeverity = severityOrder[a.severity] || 4;
        const bSeverity = severityOrder[b.severity] || 4;
        if (aSeverity !== bSeverity) {
          return aSeverity - bSeverity;
        }
        return b.detectedAt.getTime() - a.detectedAt.getTime(); // Most recent first
      })
      .slice(0, 5);
  }

  private applyStoreFilter(query: any, storeId?: string): void {
    if (storeId) {
      query.andWhere('campaign.storeId = :dashboardStoreId', { dashboardStoreId: storeId });
    }
  }
}
