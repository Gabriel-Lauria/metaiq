import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { IntegrationProvider } from '../../common/enums';
import { Store } from '../stores/store.entity';
import { User } from '../users/user.entity';

@Entity('oauth_states')
@Index(['provider', 'state'], { unique: true })
@Index(['storeId'])
@Index(['initiatedByUserId'])
@Index(['expiresAt'])
export class OAuthState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32 })
  provider: IntegrationProvider;

  @Column({ type: 'varchar', length: 128 })
  state: string;

  @Column()
  storeId: string;

  @Column()
  initiatedByUserId: string;

  @Column()
  expiresAt: Date;

  @Column({ nullable: true })
  usedAt: Date | null;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'initiatedByUserId' })
  initiatedByUser: User;

  @CreateDateColumn()
  createdAt: Date;
}
