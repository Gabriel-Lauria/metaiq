import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from "typeorm";
import { User } from "../users/user.entity";
import { Store } from "../stores/store.entity";
import { CryptoTransformer } from "../../common/transformers/crypto.transformer";
import { IntegrationProvider, SyncStatus } from "../../common/enums";

@Entity("ad_accounts")
@Index(["userId"])
@Index(["storeId"])
@Index(["metaId"])
@Unique("UQ_ad_accounts_id_storeId", ["id", "storeId"])
export class AdAccount {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  metaId: string; // ID da conta no Meta

  @Column({ type: "varchar", length: 32, default: IntegrationProvider.META })
  provider: IntegrationProvider;

  @Column({ nullable: true })
  externalId: string | null;

  @Column({ type: "varchar", length: 32, default: SyncStatus.NEVER_SYNCED })
  syncStatus: SyncStatus;

  @Column({ nullable: true })
  importedAt: Date | null;

  @Column({ nullable: true })
  lastSeenAt: Date | null;

  @Column()
  name: string;

  @Column({ nullable: true })
  currency: string; // USD, BRL, etc.

  @Column({
    nullable: true,
    select: false,
    transformer: new CryptoTransformer(),
  })
  accessToken: string; // Token de acesso da Meta API (criptografado no banco)

  @Column({ type: "date", nullable: true })
  tokenExpiresAt: Date;

  @Column({ default: true })
  active: boolean;

  @Column()
  userId: string;

  @Column()
  storeId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User;

  @ManyToOne(() => Store, (store) => store.adAccounts, { nullable: false })
  @JoinColumn({ name: "storeId" })
  store: Store;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
