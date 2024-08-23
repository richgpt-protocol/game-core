import { Column, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity()
export class PrizeAlgo {

  @PrimaryGeneratedColumn()
  id: number

  @UpdateDateColumn()
  updatedDate: Date

  @Column()
  updatedBy: string

  // ----- max ticket -----

  @Column({ nullable: true })
  maxTicketPriority: number | null

  @Column({ nullable: true })
  maxTicketFirstPrizeCount: number | null

  @Column({ nullable: true })
  maxTicketSecondPrizeCount: number | null

  @Column({ nullable: true })
  maxTicketThirdPrizeCount: number | null

  @Column({ nullable: true })
  maxTicketSpecialPrizeCount: number | null

  @Column({ nullable: true })
  maxTicketConsolationPrizeCount: number | null

  @Column({ nullable: true })
  maxTicketStartEpoch: number | null

  @Column({ nullable: true })
  maxTicketEndEpoch: number | null


  // ----- least first -----

  @Column({ nullable: true })
  leastFirstPriority: number | null

  @Column()
  leastFirstRandomLevel: 1 | 2 | 3

  @Column({ nullable: true })
  leastFirstStartEpoch: number | null

  @Column({ nullable: true })
  leastFirstEndEpoch: number | null


  // ----- fixed number -----

  @Column({ nullable: true })
  fixedNumberPriority: number | null

  @Column()
  fixedNumberNumberPair: string

  @Column()
  fixedNumberIndex: number

  @Column({ nullable: true })
  fixedNumberStartEpoch: number | null

  @Column({ nullable: true })
  fixedNumberEndEpoch: number | null

  
  // ----- allow prize -----

  @Column({ nullable: true })
  allowPrizePriority: number | null

  @Column()
  allowFirstPrize: boolean

  @Column()
  allowSecondPrize: boolean

  @Column()
  allowThirdPrize: boolean

  @Column()
  allowSpecialPrize: boolean

  @Column({ nullable: true })
  allowSpecialPrizeCount: number | null

  @Column()
  allowConsolationPrize: boolean

  @Column({ nullable: true })
  allowConsolationPrizeCount: number | null

  @Column({ nullable: true })
  allowPrizeStartEpoch: number | null

  @Column({ nullable: true })
  allowPrizeEndEpoch: number | null
}
