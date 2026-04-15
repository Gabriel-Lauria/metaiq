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
import { Role } from '../../common/enums/role.enum';
import { Manager } from '../managers/manager.entity';
import { UserStore } from '../user-stores/user-store.entity';

@Entity('users')
@Index(['managerId'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  name: string;

  @Column()
  password: string;

  @Column({
    type: 'simple-enum',
    enum: Role,
    default: Role.OPERATIONAL,
  })
  role: Role;

  @Column({ nullable: true })
  refreshToken: string | null;

  @Column({ default: true })
  active: boolean;

  @Column({ nullable: true })
  managerId?: string | null;

  @ManyToOne(() => Manager, (manager) => manager.users, { nullable: true })
  @JoinColumn({ name: 'managerId' })
  manager?: Manager | null;

  @OneToMany(() => UserStore, (userStore) => userStore.user)
  userStores?: UserStore[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
