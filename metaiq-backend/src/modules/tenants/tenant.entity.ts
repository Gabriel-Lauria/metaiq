import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccountType } from '../../common/enums';
import { Store } from '../stores/store.entity';
import { User } from '../users/user.entity';

@Entity('tenants')
@Index(['accountType'])
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ default: true })
  active: boolean;

  @Column({ type: 'enum', enum: AccountType, default: AccountType.AGENCY })
  accountType: AccountType;

  @Column({ nullable: true })
  cnpj: string | null;

  @Column({ nullable: true })
  phone: string | null;

  @Column({ nullable: true })
  email: string | null;

  @Column({ nullable: true })
  businessName: string | null;

  @Column({ nullable: true })
  businessSegment: string | null;

  @Column({ nullable: true })
  defaultCity: string | null;

  @Column({ nullable: true })
  defaultState: string | null;

  @Column({ nullable: true })
  website: string | null;

  @Column({ nullable: true })
  instagram: string | null;

  @Column({ nullable: true })
  whatsapp: string | null;

  @Column({ nullable: true })
  contactName: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => User, (user) => user.tenant)
  users: User[];

  @OneToMany(() => Store, (store) => store.tenant)
  stores: Store[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
