import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, SelectQueryBuilder, Repository } from "typeorm";
import { Role } from "../enums";
import { AuthenticatedUser } from "../interfaces";
import { OwnershipResource } from "../decorators/check-ownership.decorator";
import { Store } from "../../modules/stores/store.entity";
import { UserStore } from "../../modules/user-stores/user-store.entity";
import { Campaign } from "../../modules/campaigns/campaign.entity";
import { AdAccount } from "../../modules/ad-accounts/ad-account.entity";
import { Insight } from "../../modules/insights/insight.entity";
import { User } from "../../modules/users/user.entity";
import { Asset } from "../../modules/assets/entities/asset.entity";

@Injectable()
export class AccessScopeService {
  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(UserStore)
    private readonly userStoreRepository: Repository<UserStore>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Asset)
    private readonly assetRepository: Repository<Asset>,
  ) {}

  isAdmin(user: AuthenticatedUser): boolean {
    return user.role === Role.ADMIN;
  }

  isPlatformAdmin(user: AuthenticatedUser): boolean {
    return user.role === Role.PLATFORM_ADMIN;
  }

  isManager(user: AuthenticatedUser): boolean {
    return user.role === Role.MANAGER;
  }

  isOperational(user: AuthenticatedUser): boolean {
    return user.role === Role.OPERATIONAL;
  }

  isClient(user: AuthenticatedUser): boolean {
    return user.role === Role.CLIENT;
  }

  async getAllowedStoreIds(user: AuthenticatedUser): Promise<string[] | null> {
    if (this.isPlatformAdmin(user)) {
      return null;
    }

    if (this.isAdmin(user)) {
      if (!user.tenantId) {
        return [];
      }

      const stores = await this.storeRepository.find({
        where: {
          tenantId: user.tenantId,
          active: true,
          deletedAt: IsNull(),
        },
        select: ["id"],
      });
      return stores.map((store) => store.id);
    }

    if (this.isManager(user)) {
      return this.getManagerStoreIds(user);
    }

    return this.getDirectlyLinkedStoreIds(user.id);
  }

  async canAccessStore(
    user: AuthenticatedUser,
    storeId: string,
  ): Promise<boolean> {
    try {
      await this.validateStoreAccess(user, storeId);
      return true;
    } catch {
      return false;
    }
  }

  async validateStoreAccess(
    user: AuthenticatedUser,
    storeId?: string | null,
  ): Promise<Store> {
    if (!storeId) {
      throw new BadRequestException("storeId é obrigatório");
    }

    const store = await this.storeRepository.findOne({
      where: { id: storeId, deletedAt: IsNull() },
      relations: ["manager", "tenant"],
    });
    if (!store || !store.active) {
      throw new NotFoundException("Store não encontrada");
    }

    await this.assertStoreScopeAccess(user, store.id, store.tenantId);
    return store;
  }

  validateTenantAccess(
    user: AuthenticatedUser,
    tenantId?: string | null,
  ): void {
    if (this.isPlatformAdmin(user)) {
      return;
    }

    if (!tenantId || user.tenantId !== tenantId) {
      throw new ForbiddenException("Tenant fora do escopo do usuário");
    }
  }

  async canAccessUser(
    user: AuthenticatedUser,
    targetUserId: string,
  ): Promise<boolean> {
    try {
      await this.validateUserAccess(user, targetUserId);
      return true;
    } catch {
      return false;
    }
  }

  async validateUserAccess(
    user: AuthenticatedUser,
    targetUserId?: string | null,
  ): Promise<User> {
    if (!targetUserId) {
      throw new BadRequestException("userId é obrigatório");
    }

    const targetUser = await this.userRepository.findOne({
      where: { id: targetUserId, deletedAt: IsNull() },
    });

    if (!targetUser) {
      throw new NotFoundException("Usuário não encontrado");
    }

    if (this.isPlatformAdmin(user) || user.id === targetUserId) {
      return targetUser;
    }

    if (this.isAdmin(user)) {
      if (!user.tenantId || targetUser.tenantId !== user.tenantId) {
        throw new ForbiddenException(
          "Usuário fora do tenant do usuário autenticado",
        );
      }

      return targetUser;
    }

    if (this.isManager(user)) {
      await this.assertManagerUserAccess(user, targetUser);
      return targetUser;
    }

    throw new ForbiddenException(
      "Usuário fora do escopo do usuário autenticado",
    );
  }

  async canAccessCampaign(
    user: AuthenticatedUser,
    campaignId: string,
  ): Promise<boolean> {
    try {
      await this.validateCampaignAccess(user, campaignId);
      return true;
    } catch {
      return false;
    }
  }

  async validateCampaignAccess(
    user: AuthenticatedUser,
    campaignId?: string | null,
  ): Promise<Campaign> {
    if (!campaignId) {
      throw new BadRequestException("campaignId é obrigatório");
    }

    const campaignRepository =
      this.storeRepository.manager.getRepository(Campaign);
    const campaign = await campaignRepository.findOne({
      where: { id: campaignId },
      relations: ["store", "adAccount"],
    });

    if (!campaign) {
      throw new NotFoundException("Campanha não encontrada");
    }

    if (!campaign.store || campaign.store.deletedAt || !campaign.store.active) {
      throw new NotFoundException("Store da campanha não encontrada");
    }

    if (
      !campaign.adAccount ||
      campaign.adAccount.storeId !== campaign.storeId
    ) {
      throw new BadRequestException(
        "Campanha possui cadeia estrutural inválida",
      );
    }

    await this.assertStoreScopeAccess(
      user,
      campaign.storeId,
      campaign.store.tenantId,
    );
    return campaign;
  }

  async canAccessMetricCampaign(
    user: AuthenticatedUser,
    campaignId: string,
  ): Promise<boolean> {
    return this.canAccessCampaign(user, campaignId);
  }

  async canAccessAdAccount(
    user: AuthenticatedUser,
    adAccountId: string,
  ): Promise<boolean> {
    try {
      await this.validateAdAccountAccess(user, adAccountId);
      return true;
    } catch {
      return false;
    }
  }

  async validateAdAccountAccess(
    user: AuthenticatedUser,
    adAccountId?: string | null,
  ): Promise<AdAccount> {
    if (!adAccountId) {
      throw new BadRequestException("adAccountId é obrigatório");
    }

    const adAccountRepository =
      this.storeRepository.manager.getRepository(AdAccount);
    const adAccount = await adAccountRepository.findOne({
      where: { id: adAccountId },
      relations: ["store"],
    });

    if (!adAccount) {
      throw new NotFoundException("Conta de anúncios não encontrada");
    }

    if (
      !adAccount.store ||
      adAccount.store.deletedAt ||
      !adAccount.store.active
    ) {
      throw new NotFoundException("Store da conta de anúncios não encontrada");
    }

    await this.assertStoreScopeAccess(
      user,
      adAccount.storeId,
      adAccount.store.tenantId,
    );
    return adAccount;
  }

  async validateAdAccountInStoreAccess(
    user: AuthenticatedUser,
    storeId: string,
    adAccountId?: string | null,
  ): Promise<AdAccount> {
    const [store, adAccount] = await Promise.all([
      this.validateStoreAccess(user, storeId),
      this.validateAdAccountAccess(user, adAccountId),
    ]);

    if (adAccount.storeId !== store.id) {
      throw new BadRequestException(
        "A conta de anúncios informada não pertence à store selecionada.",
      );
    }

    return adAccount;
  }

  async canAccessInsight(
    user: AuthenticatedUser,
    insightId: string,
  ): Promise<boolean> {
    try {
      await this.validateInsightAccess(user, insightId);
      return true;
    } catch {
      return false;
    }
  }

  async canAccessAsset(
    user: AuthenticatedUser,
    storeId: string,
    assetId: string,
  ): Promise<boolean> {
    try {
      await this.validateAssetAccess(user, storeId, assetId);
      return true;
    } catch {
      return false;
    }
  }

  async validateInsightAccess(
    user: AuthenticatedUser,
    insightId?: string | null,
  ): Promise<Insight> {
    if (!insightId) {
      throw new BadRequestException("insightId é obrigatório");
    }

    const insightRepository =
      this.storeRepository.manager.getRepository(Insight);
    const insight = await insightRepository.findOne({
      where: { id: insightId },
      relations: ["campaign", "campaign.store"],
    });

    if (!insight) {
      throw new NotFoundException("Insight não encontrado");
    }

    if (
      !insight.campaign?.store ||
      insight.campaign.store.deletedAt ||
      !insight.campaign.store.active
    ) {
      throw new NotFoundException("Store do insight não encontrada");
    }

    await this.assertStoreScopeAccess(
      user,
      insight.campaign.storeId,
      insight.campaign.store.tenantId,
    );
    return insight;
  }

  async validateCampaignInStoreAccess(
    user: AuthenticatedUser,
    storeId: string,
    campaignId?: string | null,
  ): Promise<Campaign> {
    const [store, campaign] = await Promise.all([
      this.validateStoreAccess(user, storeId),
      this.validateCampaignAccess(user, campaignId),
    ]);

    if (campaign.storeId !== store.id) {
      throw new BadRequestException(
        "A campanha informada não pertence à store selecionada.",
      );
    }

    return campaign;
  }

  async validateCampaignInAdAccountAccess(
    user: AuthenticatedUser,
    storeId: string,
    adAccountId: string,
    campaignId?: string | null,
  ): Promise<Campaign> {
    const [adAccount, campaign] = await Promise.all([
      this.validateAdAccountInStoreAccess(user, storeId, adAccountId),
      this.validateCampaignInStoreAccess(user, storeId, campaignId),
    ]);

    if (campaign.adAccountId !== adAccount.id) {
      throw new BadRequestException(
        "A campanha informada não pertence à conta de anúncios selecionada.",
      );
    }

    return campaign;
  }

  async validateAssetAccess(
    user: AuthenticatedUser,
    storeId: string,
    assetId?: string | null,
  ): Promise<Asset> {
    if (!assetId) {
      throw new BadRequestException("assetId é obrigatório");
    }

    const [store, asset] = await Promise.all([
      this.validateStoreAccess(user, storeId),
      this.assetRepository.findOne({
        where: { id: assetId, storeId },
      }),
    ]);

    if (!asset) {
      throw new NotFoundException("Asset não encontrado para a store informada");
    }

    if (asset.storeId !== store.id) {
      throw new ForbiddenException("Asset fora da store do usuário");
    }

    return asset;
  }

  async validateAssetOwnershipAccess(
    user: AuthenticatedUser,
    assetId?: string | null,
  ): Promise<Asset> {
    if (!assetId) {
      throw new BadRequestException("assetId é obrigatório");
    }

    const asset = await this.assetRepository.findOne({
      where: { id: assetId },
    });

    if (!asset) {
      throw new NotFoundException("Asset não encontrado");
    }

    await this.validateStoreAccess(user, asset.storeId);
    return asset;
  }

  async canAccessResource(
    user: AuthenticatedUser,
    resource: OwnershipResource,
    id: string,
  ): Promise<boolean> {
    switch (resource) {
      case "campaign":
        return this.canAccessCampaign(user, id);
      case "metricCampaign":
        return this.canAccessMetricCampaign(user, id);
      case "adAccount":
        return this.canAccessAdAccount(user, id);
      case "insight":
        return this.canAccessInsight(user, id);
      case "store":
        return this.canAccessStore(user, id);
      case "user":
        return this.canAccessUser(user, id);
      case "asset":
        return this.canAccessAssetById(user, id);
      default:
        return false;
    }
  }

  async validateResourceAccess(
    user: AuthenticatedUser,
    resource: OwnershipResource,
    id: string,
  ): Promise<void> {
    switch (resource) {
      case "campaign":
      case "metricCampaign":
        await this.validateCampaignAccess(user, id);
        return;
      case "adAccount":
        await this.validateAdAccountAccess(user, id);
        return;
      case "insight":
        await this.validateInsightAccess(user, id);
        return;
      case "store":
        await this.validateStoreAccess(user, id);
        return;
      case "user":
        await this.validateUserAccess(user, id);
        return;
      case "asset":
        await this.validateAssetOwnershipAccess(user, id);
        return;
      default:
        throw new ForbiddenException(
          "Recurso sem policy de ownership configurada",
        );
    }
  }

  async applyCampaignScope<T>(
    query: SelectQueryBuilder<T>,
    alias: string,
    user: AuthenticatedUser,
  ): Promise<SelectQueryBuilder<T>> {
    if (this.isPlatformAdmin(user)) {
      return query;
    }

    query.innerJoin(`${alias}.store`, `${alias}_scopeStore`);

    if (this.isAdmin(user)) {
      if (!user.tenantId) {
        return query.andWhere("1 = 0");
      }

      query
        .andWhere(`${alias}_scopeStore.tenantId = :scopeTenantId`, {
          scopeTenantId: user.tenantId,
        })
        .andWhere(`${alias}_scopeStore.deletedAt IS NULL`);

      return query;
    }

    if (this.isManager(user)) {
      const storeIds = await this.getManagerStoreIds(user);
      if (!storeIds.length) {
        return query.andWhere("1 = 0");
      }

      return query.andWhere(`${alias}.storeId IN (:...scopeStoreIds)`, {
        scopeStoreIds: storeIds,
      });
    }

    const storeIds = await this.getAllowedStoreIds(user);
    if (!storeIds?.length) {
      return query.andWhere("1 = 0");
    }

    return query.andWhere(`${alias}.storeId IN (:...scopeStoreIds)`, {
      scopeStoreIds: storeIds,
    });
  }

  async applyAdAccountScope<T>(
    query: SelectQueryBuilder<T>,
    alias: string,
    user: AuthenticatedUser,
  ): Promise<SelectQueryBuilder<T>> {
    if (this.isPlatformAdmin(user)) {
      return query;
    }

    query.innerJoin(`${alias}.store`, `${alias}_scopeStore`);

    if (this.isAdmin(user)) {
      if (!user.tenantId) {
        return query.andWhere("1 = 0");
      }

      query
        .andWhere(`${alias}_scopeStore.tenantId = :scopeTenantId`, {
          scopeTenantId: user.tenantId,
        })
        .andWhere(`${alias}_scopeStore.deletedAt IS NULL`);

      return query;
    }

    if (this.isManager(user)) {
      const storeIds = await this.getManagerStoreIds(user);
      if (!storeIds.length) {
        return query.andWhere("1 = 0");
      }

      return query.andWhere(`${alias}.storeId IN (:...scopeStoreIds)`, {
        scopeStoreIds: storeIds,
      });
    }

    const storeIds = await this.getAllowedStoreIds(user);
    if (!storeIds?.length) {
      return query.andWhere("1 = 0");
    }

    return query.andWhere(`${alias}.storeId IN (:...scopeStoreIds)`, {
      scopeStoreIds: storeIds,
    });
  }

  async applyStoreScope<T>(
    query: SelectQueryBuilder<T>,
    alias: string,
    user: AuthenticatedUser,
    options: { activeOnly?: boolean } = {},
  ): Promise<SelectQueryBuilder<T>> {
    const activeOnly = options.activeOnly ?? true;
    if (this.isPlatformAdmin(user)) {
      query.andWhere(`${alias}.deletedAt IS NULL`);
      if (activeOnly) {
        query.andWhere(`${alias}.active = :scopeStoreActive`, {
          scopeStoreActive: true,
        });
      }
      return query;
    }

    if (this.isAdmin(user)) {
      if (!user.tenantId) {
        return query.andWhere("1 = 0");
      }

      query
        .andWhere(`${alias}.tenantId = :scopeTenantId`, {
          scopeTenantId: user.tenantId,
        })
        .andWhere(`${alias}.deletedAt IS NULL`);

      if (activeOnly) {
        query.andWhere(`${alias}.active = :scopeStoreActive`, {
          scopeStoreActive: true,
        });
      }

      return query;
    }

    if (this.isManager(user)) {
      const storeIds = await this.getManagerStoreIds(user);
      if (!storeIds.length) {
        return query.andWhere("1 = 0");
      }

      query.andWhere(`${alias}.id IN (:...scopeStoreIds)`, {
        scopeStoreIds: storeIds,
      });
      if (activeOnly) {
        query.andWhere(`${alias}.active = :scopeStoreActive`, {
          scopeStoreActive: true,
        });
      }

      return query.andWhere(`${alias}.deletedAt IS NULL`);
    }

    const storeIds = await this.getAllowedStoreIds(user);
    if (!storeIds?.length) {
      return query.andWhere("1 = 0");
    }

    query.andWhere(`${alias}.id IN (:...scopeStoreIds)`, {
      scopeStoreIds: storeIds,
    });
    if (activeOnly) {
      query.andWhere(`${alias}.active = :scopeStoreActive`, {
        scopeStoreActive: true,
      });
    }
    return query.andWhere(`${alias}.deletedAt IS NULL`);
  }

  async applyUserScope<T>(
    query: SelectQueryBuilder<T>,
    alias: string,
    user: AuthenticatedUser,
  ): Promise<SelectQueryBuilder<T>> {
    if (this.isPlatformAdmin(user)) {
      return query.andWhere(`${alias}.deletedAt IS NULL`);
    }

    if (this.isAdmin(user)) {
      if (!user.tenantId) {
        return query.andWhere("1 = 0");
      }

      query
        .andWhere(`${alias}.tenantId = :scopeTenantId`, {
          scopeTenantId: user.tenantId,
        })
        .andWhere(`${alias}.deletedAt IS NULL`);

      return query;
    }

    if (this.isManager(user)) {
      const userIds = await this.getManagerAccessibleUserIds(user);
      if (!userIds.length) {
        return query.andWhere("1 = 0");
      }

      return query
        .andWhere(`${alias}.id IN (:...scopeUserIds)`, {
          scopeUserIds: userIds,
        })
        .andWhere(`${alias}.deletedAt IS NULL`);
    }

    return query
      .andWhere(`${alias}.id = :scopeUserId`, { scopeUserId: user.id })
      .andWhere(`${alias}.deletedAt IS NULL`);
  }

  async applyMetricScope<T>(
    query: SelectQueryBuilder<T>,
    campaignAlias: string,
    user: AuthenticatedUser,
  ): Promise<SelectQueryBuilder<T>> {
    return this.applyCampaignScope(query, campaignAlias, user);
  }

  async applyInsightScope<T>(
    query: SelectQueryBuilder<T>,
    campaignAlias: string,
    user: AuthenticatedUser,
  ): Promise<SelectQueryBuilder<T>> {
    return this.applyCampaignScope(query, campaignAlias, user);
  }

  private async assertStoreScopeAccess(
    user: AuthenticatedUser,
    storeId: string,
    tenantId?: string | null,
  ): Promise<void> {
    if (this.isPlatformAdmin(user)) {
      return;
    }

    if (this.isAdmin(user)) {
      if (!user.tenantId || tenantId !== user.tenantId) {
        throw new ForbiddenException("Recurso fora do tenant do usuário");
      }

      return;
    }

    if (this.isManager(user)) {
      const allowedStoreIds = await this.getManagerStoreIds(user);
      if (!allowedStoreIds.includes(storeId)) {
        throw new ForbiddenException("Recurso fora do escopo do manager");
      }

      return;
    }

    const link = await this.userStoreRepository.findOne({
      where: { userId: user.id, storeId },
    });

    if (!link) {
      throw new ForbiddenException("Usuário sem acesso à store do recurso");
    }
  }

  private async canAccessAssetById(
    user: AuthenticatedUser,
    assetId: string,
  ): Promise<boolean> {
    try {
      await this.validateAssetOwnershipAccess(user, assetId);
      return true;
    } catch {
      return false;
    }
  }

  private async getDirectlyLinkedStoreIds(userId: string): Promise<string[]> {
    const links = await this.userStoreRepository.find({
      where: { userId },
      relations: ["store"],
    });

    return links
      .filter((link) => link.store?.active && !link.store.deletedAt)
      .map((link) => link.storeId);
  }

  private async getManagerStoreIds(user: AuthenticatedUser): Promise<string[]> {
    const linkedStoreIds = await this.getDirectlyLinkedStoreIds(user.id);
    if (linkedStoreIds.length) {
      return linkedStoreIds;
    }

    const createdStores = await this.storeRepository.find({
      where: {
        createdByUserId: user.id,
        deletedAt: IsNull(),
        active: true,
      },
      select: ["id"],
    });

    return createdStores.map((store) => store.id);
  }

  private async getManagerAccessibleUserIds(
    user: AuthenticatedUser,
  ): Promise<string[]> {
    const candidateIds = new Set<string>([user.id]);
    const managerStoreIds = await this.getManagerStoreIds(user);

    if (managerStoreIds.length) {
      const linkedUsers = await this.userStoreRepository.find({
        where: managerStoreIds.map((storeId) => ({ storeId })),
        select: ["userId"],
      });
      for (const link of linkedUsers) {
        candidateIds.add(link.userId);
      }
    }

    const createdUsers = await this.userRepository.find({
      where: {
        createdByUserId: user.id,
        tenantId: user.tenantId ?? null,
        deletedAt: IsNull(),
      },
      select: ["id"],
    });

    for (const createdUser of createdUsers) {
      candidateIds.add(createdUser.id);
    }

    const scopedUsers = await this.userRepository.find({
      where: Array.from(candidateIds).map((id) => ({ id, deletedAt: IsNull() })),
      select: ["id", "role", "tenantId", "managerId"],
    });

    return scopedUsers
      .filter((candidate) => {
        if (candidate.id === user.id) {
          return true;
        }

        if (candidate.tenantId !== user.tenantId) {
          return false;
        }

        if (user.managerId && candidate.managerId && candidate.managerId !== user.managerId) {
          return false;
        }

        return [Role.OPERATIONAL, Role.CLIENT].includes(candidate.role);
      })
      .map((candidate) => candidate.id);
  }

  private async assertManagerUserAccess(
    user: AuthenticatedUser,
    targetUser: User,
  ): Promise<void> {
    if (!user.tenantId || targetUser.tenantId !== user.tenantId) {
      throw new ForbiddenException(
        "Usuário fora do tenant do usuário autenticado",
      );
    }

    if ([Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER].includes(targetUser.role)) {
      throw new ForbiddenException(
        "Manager não pode operar usuários administrativos fora da própria conta",
      );
    }

    if (user.managerId && targetUser.managerId && targetUser.managerId !== user.managerId) {
      throw new ForbiddenException(
        "Usuário fora da hierarquia direta do manager",
      );
    }

    const managerStoreIds = await this.getManagerStoreIds(user);
    const hasSharedStore = managerStoreIds.length
      ? (await this.userStoreRepository
          .createQueryBuilder("userStore")
          .where("userStore.userId = :userId", { userId: targetUser.id })
          .andWhere("userStore.storeId IN (:...storeIds)", {
            storeIds: managerStoreIds,
          })
          .getCount()) > 0
      : false;

    if (hasSharedStore || targetUser.createdByUserId === user.id) {
      return;
    }

    throw new ForbiddenException(
      "Usuário fora da hierarquia direta do manager",
    );
  }
}
