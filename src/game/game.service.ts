/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import { ChatCompletionMessageParam } from 'openai/resources';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

// import { SendMessageDto } from './dto/bet.dto';
// import { MongoClient, WithId } from 'mongodb'
import * as dotenv from 'dotenv';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bet } from 'src/bet/entities/bet.entity';
import { User } from 'src/user/entities/user.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { BetDto } from 'src/bet/dto/bet.dto';
import { ClaimDto } from '../claim/dto/claim.dto';
import { Claim } from '../claim/entities/claim.entity';
import { Game } from './entities/game.entity';
import { RedeemDto } from '../redeem/dto/redeem.dto';
import { Redeem } from '../redeem/entities/redeem.entity';
import { DrawResultDto } from './dto/drawResult.dto';
import { DrawResult } from './entities/drawResult.entity';
import { Core__factory } from 'src/contract';
import { JsonRpcProvider } from 'ethers';
import { ConfigService } from 'src/config/config.service';
dotenv.config();

// const client = new MongoClient('mongodb://localhost:27017')

@Injectable()
export class GameService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(Game)
    private gameRepository: Repository<Game>,
    @InjectRepository(Bet)
    private betRepository: Repository<Bet>,
    @InjectRepository(Claim)
    private claimRepository: Repository<Claim>,
    @InjectRepository(Redeem)
    private redeemRepository: Repository<Redeem>,
    @InjectRepository(DrawResult)
    private drawResultRepository: Repository<DrawResult>,
    private schedulerRegistry: SchedulerRegistry,
    private configService: ConfigService,
  ) {}

  async setDrawResult(id: number, payload: DrawResultDto) {
    // TODO: submit draw result to Core contract

    const game = await this.gameRepository.findOneBy({ epoch: payload.epoch });
    const drawResult = this.drawResultRepository.create({
      ...payload,
      game,
    });
    const res = await this.drawResultRepository.save(drawResult);

    await this.gameRepository.save(
      this.gameRepository.create({
        epoch: game.epoch + 1,
      }),
    );

    return res;
  }

  async getDrawResult(epoch: number) {
    const game = await this.gameRepository.findOneBy({ epoch });
    const drawResult = await this.drawResultRepository
      .createQueryBuilder('row')
      .where({ game })
      .getOne();
    return drawResult;
  }

  async triggerDrawResult() {
    const existingCron = this.schedulerRegistry.doesExist(
      'cron',
      'setDrawResult',
    );
    if (existingCron) {
      return;
    }

    const cron = this.schedulerRegistry.addCronJob(
      'setDrawResult',
      new CronJob('*/20 * * * * *', async () => {
        const provider = new JsonRpcProvider(this.configService.get('RPC_URL'));
        const coreContract = Core__factory.connect(
          this.configService.get('CORE_CONTRACT'),
          provider,
        );

        //Earliest game with epoch where isClosed is false
        const game = await this.gameRepository
          .createQueryBuilder('row')
          .where({ isClosed: false })
          .orderBy('row.epoch', 'ASC')
          .getOne();

        const drawResultsDb = await this.drawResultRepository.findOneBy({
          game,
        });

        if (drawResultsDb && !drawResultsDb.consolation1) {
          drawResultsDb.submitBy = 'system';
          drawResultsDb.fetchStartAt = new Date();
          for (let i = 0; i < 20; i++) {
            const drawResult = await coreContract.drawResults(
              game.epoch.toString(),
              i.toString(),
            );
            drawResultsDb[`consolation${i + 1}`] = drawResult.toString();
          }
        } else if (drawResultsDb && !drawResultsDb.special1) {
          for (let i = 10; i != 0; i++) {
            if (!drawResultsDb[`special${i}`]) {
              const drawResult = await coreContract.drawResults(
                game.epoch.toString(),
                i.toString(),
              );

              drawResultsDb[`special${i}`] = drawResult.toString();

              break; //exit the loop if a missing special is found. i.e set only one special at a time
            }
          }
        } else if (drawResultsDb && !drawResultsDb.third) {
          const drawResult = await coreContract.drawResults(
            game.epoch.toString(),
            '2',
          );
          drawResultsDb.third = drawResult.toString();
        } else if (drawResultsDb && !drawResultsDb.second) {
          const drawResult = await coreContract.drawResults(
            game.epoch.toString(),
            '1',
          );
          drawResultsDb.second = drawResult.toString();
        } else if (drawResultsDb && !drawResultsDb.first) {
          const drawResult = await coreContract.drawResults(
            game.epoch.toString(),
            '0',
          );
          drawResultsDb.first = drawResult.toString();
        } else if (drawResultsDb && drawResultsDb.first) {
          //first is set. Clear the cron
          this.schedulerRegistry.deleteCronJob('setDrawResult');
        }
      }),
    );
  }
}
