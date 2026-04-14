import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from '../users/user.entity';
import { CryptoTransformer } from '../../common/transformers/crypto.transformer';

@Entity('ad_accounts')
@Index(['userId'])
@Index(['metaId'])
export class AdAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  metaId: string; // ID da conta no Meta

  @Column()
  name: string;

  @Column({ nullable: true })
  currency: string; // USD, BRL, etc.

  @Column({ nullable: true, select: false, transformer: new CryptoTransformer() })
  accessToken: string; // Token de acesso da Meta API (criptografado no banco)

  @Column({ type: 'date', nullable: true })
  tokenExpiresAt: Date;

  @Column({ default: true })
  active: boolean;

  @Column()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
