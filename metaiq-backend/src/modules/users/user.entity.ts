import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Role } from '../../common/enums';
import { Manager } from '../managers/manager.entity';
import { Tenant } from '../tenants/tenant.entity';
import { UserStore } from '../user-stores/user-store.entity';

@Entity('users')
@Index(['managerId'])
@Index(['tenantId'])
@Index(['createdByUserId'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  name: string;

  @Column()
  password: string;

  @Column({ type: 'simple-enum', enum: Role, default: Role.OPERATIONAL })
  role: Role;

  @Column({ nullable: true })
  managerId: string | null;

  @Column({ nullable: true })
  tenantId: string | null;

  @Column({ nullable: true })
  createdByUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdByUserId' })
  createdBy: User | null;

  @ManyToOne(() => Manager, (manager) => manager.users, { nullable: true })
  @JoinColumn({ name: 'managerId' })
  manager: Manager | null;

  @ManyToOne(() => Tenant, (tenant) => tenant.users, { nullable: true })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant | null;

  @OneToMany(() => UserStore, (userStore) => userStore.user)
  userStores: UserStore[];

  @Column({ nullable: true })
  refreshToken: string | null;

  @Column({ type: 'int', default: 0 })
  sessionVersion: number;

  @Column({ nullable: true })
  onboardingCompletedAt: Date | null;

  @Column({ default: true })
  active: boolean;

  @Column({ nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
