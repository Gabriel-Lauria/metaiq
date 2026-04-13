import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Campaign } from '../campaigns/campaign.entity';

@Entity('metrics_daily')
@Index(['campaignId'])
@Index(['date'])
export class MetricDaily {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  campaignId: string;

  @Column({ type: 'date' })
  date: string;

  @Column()
  impressions: number;

  @Column()
  clicks: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  spend: number;

  @Column()
  conversions: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  revenue: number;

  @Column({ type: 'decimal', precision: 6, scale: 4 })
  ctr: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  cpa: number;

  @Column({ type: 'decimal', precision: 6, scale: 2 })
  roas: number;

  @ManyToOne(() => Campaign)
  @JoinColumn({ name: 'campaignId' })
  campaign: Campaign;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
