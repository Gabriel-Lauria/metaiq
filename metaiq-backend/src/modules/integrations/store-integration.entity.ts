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
import { CryptoTransformer } from '../../common/transformers/crypto.transformer';
import { IntegrationProvider, IntegrationStatus, SyncStatus } from '../../common/enums';
import { Store } from '../stores/store.entity';

@Entity('store_integrations')
@Unique('UQ_store_integrations_store_provider', ['storeId', 'provider'])
@Index(['storeId'])
@Index(['provider'])
@Index(['status'])
export class StoreIntegration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  storeId: string;

  @Column({ type: 'varchar', length: 32, default: IntegrationProvider.META })
  provider: IntegrationProvider;

  @Column({ type: 'varchar', length: 32, default: IntegrationStatus.NOT_CONNECTED })
  status: IntegrationStatus;

  @Column({ nullable: true })
  externalBusinessId: string | null;

  @Column({ nullable: true })
  externalAdAccountId: string | null;

  @Column({ nullable: true, select: false, transformer: new CryptoTransformer() })
  accessToken: string | null;

  @Column({ nullable: true, select: false, transformer: new CryptoTransformer() })
  refreshToken: string | null;

  @Column({ nullable: true })
  tokenExpiresAt: Date | null;

  @Column({ nullable: true })
  tokenType: string | null;

  @Column({ type: 'text', nullable: true })
  grantedScopes: string | null;

  @Column({ nullable: true })
  providerUserId: string | null;

  @Column({ nullable: true })
  oauthConnectedAt: Date | null;

  @Column({ nullable: true })
  lastSyncAt: Date | null;

  @Column({ type: 'varchar', length: 32, default: SyncStatus.NEVER_SYNCED })
  lastSyncStatus: SyncStatus;

  @Column({ type: 'text', nullable: true })
  lastSyncError: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
