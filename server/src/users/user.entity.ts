import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
  OBSERVER = 'OBSERVER',
}

/**
 * 사용자 정보를 저장하는 엔티티입니다.
 */
@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string;

  @Column({ type: 'varchar', length: 100, default: 'LOCAL' })
  provider: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  providerId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  nickname: string | null;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
