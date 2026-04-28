import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { Store } from "../../stores/store.entity";
import { User } from "../../users/user.entity";
import { AdAccount } from "../../ad-accounts/ad-account.entity";
import { Campaign } from "../../campaigns/campaign.entity";

export enum MetaCampaignCreationStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  PARTIAL = "PARTIAL",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
  CREATING = "CREATING",
  ACTIVE = "ACTIVE",
}

export type MetaCampaignCreationStep =
  | "campaign"
  | "adset"
  | "creative"
  | "ad"
  | "persist";

export type MetaCampaignExecutionStepStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED";

export type MetaCampaignExecutionIds = Partial<Record<"campaignId" | "adSetId" | "creativeId" | "adId", string>>;

export interface MetaCampaignExecutionStepState {
  status: MetaCampaignExecutionStepStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
  errorMessage?: string | null;
  ids?: MetaCampaignExecutionIds;
}

export type MetaCampaignExecutionStepStateMap = Record<MetaCampaignCreationStep, MetaCampaignExecutionStepState>;

@Entity("meta_campaign_creations")
@Unique("UQ_meta_campaign_creations_store_idempotency", [
  "storeId",
  "idempotencyKey",
])
@Index(["storeId"])
@Index(["requesterUserId"])
@Index(["adAccountId"])
@Index(["storeId", "adAccountId"])
@Index(["status"])
@Index(["metaCampaignId"])
@Index(["payloadHash"])
export class MetaCampaignCreation {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  storeId: string;

  @Column()
  requesterUserId: string;

  @Column()
  adAccountId: string;

  @Column({ nullable: true })
  campaignId: string | null;

  @Column()
  idempotencyKey: string;

  @Column({
    type: "varchar",
    length: 32,
    default: MetaCampaignCreationStatus.IN_PROGRESS,
  })
  status: MetaCampaignCreationStatus;

  @Column({ default: false })
  campaignCreated: boolean;

  @Column({ default: false })
  adSetCreated: boolean;

  @Column({ default: false })
  creativeCreated: boolean;

  @Column({ default: false })
  adCreated: boolean;

  @Column({ nullable: true })
  metaCampaignId: string | null;

  @Column({ nullable: true })
  metaAdSetId: string | null;

  @Column({ nullable: true })
  metaCreativeId: string | null;

  @Column({ nullable: true })
  metaAdId: string | null;

  @Column({ nullable: true })
  errorStep: string | null;

  @Column({ type: "text", nullable: true })
  errorMessage: string | null;

  @Column({ nullable: true })
  currentStep: string | null;

  @Column({ type: "simple-json", nullable: true })
  stepState: MetaCampaignExecutionStepStateMap | null;

  @Column({ type: "int", default: 0 })
  retryCount: number;

  @Column({ nullable: true })
  lastRetryAt: Date | null;

  @Column({ default: false })
  canRetry: boolean;

  @Column({ type: "text", nullable: true })
  userMessage: string | null;

  @Column({ type: "simple-json", nullable: true })
  requestPayload: Record<string, unknown> | null;

  @Column({ nullable: true })
  payloadHash: string | null;

  @ManyToOne(() => Store, { onDelete: "CASCADE" })
  @JoinColumn({ name: "storeId" })
  store: Store;

  @ManyToOne(() => User)
  @JoinColumn({ name: "requesterUserId" })
  requester: User;

  @ManyToOne(() => AdAccount)
  @JoinColumn({ name: "adAccountId" })
  adAccount: AdAccount;

  @ManyToOne(() => Campaign, { nullable: true })
  @JoinColumn({ name: "campaignId" })
  campaign: Campaign | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
