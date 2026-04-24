import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "../users/user.entity";
import { AdAccount } from "../ad-accounts/ad-account.entity";
import { Store } from "../stores/store.entity";

@Entity("campaigns")
@Index(["userId"])
@Index(["storeId"])
@Index(["createdByUserId"])
@Index(["adAccountId"])
@Index(["storeId", "adAccountId"])
@Index(["metaId"])
@Index(["externalId"])
export class Campaign {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  metaId: string;

  @Column({ nullable: true })
  externalId: string | null;

  @Column()
  name: string;

  @Column({ default: "ACTIVE" })
  status: "ACTIVE" | "PAUSED" | "ARCHIVED";

  @Column({ nullable: true, default: null })
  objective: "CONVERSIONS" | "REACH" | "TRAFFIC" | "LEADS" | null;

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  dailyBudget: number | null;

  @Column({ type: "decimal", precision: 6, scale: 2, default: 0 })
  score: number;

  @Column({ nullable: true })
  startTime: Date | null;

  @Column({ nullable: true })
  endTime?: Date;

  @Column({ nullable: true })
  lastSeenAt: Date | null;

  @Column()
  userId: string;

  @Column()
  storeId: string;

  @Column({ nullable: true })
  createdByUserId: string | null;

  @Column()
  adAccountId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User;

  @ManyToOne(() => Store, (store) => store.campaigns, { nullable: false })
  @JoinColumn({ name: "storeId" })
  store: Store;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "createdByUserId" })
  createdBy: User | null;

  @ManyToOne(() => AdAccount, { onDelete: "NO ACTION" })
  @JoinColumn({ name: "adAccountId" })
  adAccount: AdAccount;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
