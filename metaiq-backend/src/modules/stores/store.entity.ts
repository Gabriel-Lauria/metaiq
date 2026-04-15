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
import { UserStore } from '../user-stores/user-store.entity';
import { AdAccount } from '../ad-accounts/ad-account.entity';
import { Campaign } from '../campaigns/campaign.entity';

@Entity('stores')
@Index(['managerId'])
export class Store {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  managerId: string;

  @Column({ default: true })
  active: boolean;

  @ManyToOne(() => Manager, (manager) => manager.stores)
  @JoinColumn({ name: 'managerId' })
  manager: Manager;

  @OneToMany(() => UserStore, (userStore) => userStore.store)
  userStores: UserStore[];

  @OneToMany(() => AdAccount, (adAccount) => adAccount.store)
  adAccounts: AdAccount[];

  @OneToMany(() => Campaign, (campaign) => campaign.store)
  campaigns: Campaign[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
