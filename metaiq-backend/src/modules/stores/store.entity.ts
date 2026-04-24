import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Manager } from '../managers/manager.entity';
import { Tenant } from '../tenants/tenant.entity';
import { UserStore } from '../user-stores/user-store.entity';
import { AdAccount } from '../ad-accounts/ad-account.entity';
import { Campaign } from '../campaigns/campaign.entity';
import { StoreIntegration } from '../integrations/store-integration.entity';
import { User } from '../users/user.entity';

@Entity('stores')
@Index(['managerId'])
@Index(['tenantId'])
@Index(['createdByUserId'])
export class Store {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  managerId: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  createdByUserId: string | null;

  @Column({ default: true })
  active: boolean;

  @Column({ nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => Manager, (manager) => manager.stores)
  @JoinColumn({ name: 'managerId' })
  manager: Manager;

  @ManyToOne(() => Tenant, (tenant) => tenant.stores)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdByUserId' })
  createdBy: User | null;

  @OneToMany(() => UserStore, (userStore) => userStore.store)
  userStores: UserStore[];

  @OneToMany(() => AdAccount, (adAccount) => adAccount.store)
  adAccounts: AdAccount[];

  @OneToMany(() => Campaign, (campaign) => campaign.store)
  campaigns: Campaign[];

  @OneToMany(() => StoreIntegration, (integration) => integration.store)
  integrations: StoreIntegration[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
