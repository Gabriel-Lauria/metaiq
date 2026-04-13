import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { AdAccount } from '../meta/ad-account.entity';

@Entity('campaigns')
@Index(['userId'])
@Index(['adAccountId'])
@Index(['metaId'])
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  metaId: string;

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

  @Column()
  userId: string;

  @Column()
  adAccountId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => AdAccount)
  @JoinColumn({ name: 'adAccountId' })
  adAccount: AdAccount;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
