import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('audit_logs')
@Index(['actorId'])
@Index(['tenantId'])
@Index(['action'])
@Index(['targetType', 'targetId'])
@Index(['requestId'])
@Index(['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  action: string;

  @Column({ length: 16 })
  status: 'success' | 'failure';

  @Column({ nullable: true })
  actorId: string | null;

  @Column({ nullable: true })
  actorRole: string | null;

  @Column({ nullable: true })
  tenantId: string | null;

  @Column({ nullable: true })
  targetType: string | null;

  @Column({ nullable: true })
  targetId: string | null;

  @Column({ nullable: true })
  reason: string | null;

  @Column({ nullable: true })
  requestId: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
