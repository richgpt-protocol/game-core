// import { Module } from '@nestjs/common';
// import { BetService } from './bet.service';
// import { BetController } from './bet.controller';
// import { TypeOrmModule } from '@nestjs/typeorm';
// import { PermissionModule } from 'src/permission/permission.module';
// import { Game } from 'src/game/entities/game.entity';
// import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
// import { BetOrder } from 'src/game/entities/bet-order.entity';

// @Module({
//   imports: [
//     TypeOrmModule.forFeature([BetOrder, UserWallet, Game]),
//     PermissionModule,
//   ],
//   providers: [BetService],
//   controllers: [BetController],
//   exports: [],
// })
// export class BetModule {}
