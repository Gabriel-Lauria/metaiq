import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Store } from '../../stores/store.entity';
import { User } from '../../users/user.entity';

export type AssetType = 'image' | 'video';
export type AssetStatus = 'UPLOADED' | 'VALIDATED' | 'REJECTED' | 'SENT_TO_META' | 'FAILED';

@Entity('assets')
@Index(['storeId'])
@Index(['uploadedByUserId'])
export class Asset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  storeId: string;

  @Column({ nullable: true })
  uploadedByUserId: string | null;

  @Column({ type: 'varchar', length: 16 })
  type: AssetType;

  @Column({ type: 'varchar', length: 120 })
  mimeType: string;

  @Column({ type: 'bigint' })
  size: number;

  @Column({ type: 'int', nullable: true })
  width: number | null;

  @Column({ type: 'int', nullable: true })
  height: number | null;

  @Column({ type: 'varchar', length: 1000 })
  storageUrl: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  metaImageHash: string | null;

  @Column({ type: 'varchar', length: 24, default: 'UPLOADED' })
  status: AssetStatus;

  @ManyToOne(() => Store, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploadedByUserId' })
  uploadedBy: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
