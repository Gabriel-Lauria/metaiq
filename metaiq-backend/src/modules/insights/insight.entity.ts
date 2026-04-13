import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Campaign } from '../campaigns/campaign.entity';

/**
 * Insight representa uma análise/recomendação automática gerada pelo motor
 * de análise sobre uma campanha.
 *
 * Cada insight tem:
 * - type: tipo da recomendação (alert, warning, opportunity, info)
 * - severity: nível de importância (danger, warning, success, info)
 * - message: descrição legível ao usuário
 * - recommendation: ação sugerida
 * - resolved: mark como resolved quando o usuário toma ação
 * - detectedAt: quando foi gerado
 */
@Entity('insights')
@Index(['campaignId', 'resolved'])
@Index(['detectedAt'])
export class Insight {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  campaignId: string;

  @ManyToOne(() => Campaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaignId' })
  campaign: Campaign;

  @Column()
  type: 'alert' | 'warning' | 'opportunity' | 'info';

  @Column()
  severity: 'danger' | 'warning' | 'success' | 'info';

  @Column('text')
  message: string;

  @Column('text')
  recommendation: string;

  @Column({ default: false })
  resolved: boolean;

  @CreateDateColumn()
  detectedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
