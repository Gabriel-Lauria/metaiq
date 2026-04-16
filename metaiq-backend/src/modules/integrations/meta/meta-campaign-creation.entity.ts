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
} from 'typeorm';
import { Store } from '../../stores/store.entity';
import { User } from '../../users/user.entity';
import { AdAccount } from '../../ad-accounts/ad-account.entity';
import { Campaign } from '../../campaigns/campaign.entity';

export enum MetaCampaignCreationStatus {
  CREATING = 'CREATING',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
  ACTIVE = 'ACTIVE',
}

export type MetaCampaignCreationStep = 'campaign' | 'adset' | 'creative' | 'ad' | 'persist';

@Entity('meta_campaign_creations')
@Unique('UQ_meta_campaign_creations_store_idempotency', ['storeId', 'idempotencyKey'])
@Index(['storeId'])
@Index(['requesterUserId'])
@Index(['adAccountId'])
@Index(['status'])
@Index(['metaCampaignId'])
export class MetaCampaignCreation {
  @PrimaryGeneratedColumn('uuid')
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

  @Column({ type: 'varchar', length: 32, default: MetaCampaignCreationStatus.CREATING })
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

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'simple-json', nullable: true })
  requestPayload: Record<string, unknown> | null;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'requesterUserId' })
  requester: User;

  @ManyToOne(() => AdAccount)
  @JoinColumn({ name: 'adAccountId' })
  adAccount: AdAccount;

  @ManyToOne(() => Campaign, { nullable: true })
  @JoinColumn({ name: 'campaignId' })
  campaign: Campaign | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
