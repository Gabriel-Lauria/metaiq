import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { AdAccount } from '../ad-accounts/ad-account.entity';
import { Store } from '../stores/store.entity';

@Entity('campaigns')
@Index(['userId'])
@Index(['storeId'])
@Index(['adAccountId'])
@Index(['metaId'])
@Index(['externalId'])
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  metaId: string;

  @Column({ nullable: true })
  externalId: string | null;

  @Column()
  name: string;

  @Column({ default: 'ACTIVE' })
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

  @Column({ default: 'CONVERSIONS' })
  objective: 'CONVERSIONS' | 'REACH' | 'TRAFFIC' | 'LEADS';

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  dailyBudget: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
  score: number;

  @Column()
  startTime: Date;

  @Column({ nullable: true })
  endTime?: Date;

  @Column({ nullable: true })
  lastSeenAt: Date | null;

  @Column()
  userId: string;

  @Column({ nullable: true })
  storeId: string | null;

  @Column({ nullable: true })
  createdByUserId: string | null;

  @Column()
  adAccountId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Store, (store) => store.campaigns, { nullable: true })
  @JoinColumn({ name: 'storeId' })
  store: Store | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'createdByUserId' })
  createdByUser: User | null;

  @ManyToOne(() => AdAccount)
  @JoinColumn({ name: 'adAccountId' })
  adAccount: AdAccount;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
