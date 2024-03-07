import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Game } from './entities/game.entity';
import { BetOrder } from './entities/bet-order.entity';
import { DrawResult } from './entities/draw-result.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Game, BetOrder, DrawResult])],
  providers: [],
  controllers: [],
  exports: [],
})
export class GameModule {}
