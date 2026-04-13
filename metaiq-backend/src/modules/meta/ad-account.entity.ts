import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from '../users/user.entity';

@Entity('ad_accounts')
@Index(['userId'])
export class AdAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  metaAccountId: string;

  @Column()
  name: string;

  @Column()
  accessToken: string;

  @Column()
  tokenExpiresAt: Date;

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
