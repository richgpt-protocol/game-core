// /* eslint-disable @typescript-eslint/no-unused-vars */
// import { Injectable } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { BetDto } from './dto/bet.dto';
// import { Bet } from './entities/bet.entity';
// import { Repository } from 'typeorm';
// import { Game } from 'src/game/entities/game.entity';
// import { UserWallet } from 'src/wallet/entities/user-wallet.entity';

// @Injectable()
// export class BetService {
//   constructor(
//     @InjectRepository(Bet)
//     private betRepository: Repository<Bet>,
//     @InjectRepository(UserWallet)
//     private walletRepository: Repository<UserWallet>,
//     @InjectRepository(Game)
//     private gameRepository: Repository<Game>,
//   ) {}

//   async bet(userId: number, payload: BetDto[]) {
//     // TODO: submit bet to Core contract

//     const wallet = await this.walletRepository
//       .createQueryBuilder()
//       .where({ user: userId })
//       .getOne();

//     // TODO: missing checking and validations

//     const bets = [];
//     for (const bet of payload) {
//       // const game = await this.gameRepository.findOneBy({ id: bet.gameIds });
//       // bets.push(
//       //   this.betRepository.create({
//       //     numberPair: bet.number,
//       //     forecast: bet.forecast,
//       //     amount: bet.amount,
//       //     wallet,
//       //     game,
//       //   }),
//       // );
//     }
//     const res = await this.betRepository.save(bets);
//     return res;
//   }

//   async getUserBets(id: number, epoch: number) {
//     const wallet = await this.walletRepository
//       .createQueryBuilder('row')
//       .where({ user: id })
//       .getOne();
//     const bets = await this.betRepository
//       .createQueryBuilder('row')
//       .select('row')
//       .where({ wallet })
//       .getMany();
//     return bets.map((bet) => {
//       delete bet.id;
//       // delete bet.walletId;
//       delete bet.gameId;
//       return bet;
//     });
//   }
// }
