import { ethers } from 'ethers';
import { Core__factory } from '../../contract';
import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';

export default class CreateGames implements Seeder {
  /**
   * Track seeder execution.
   *
   * Default: false
   */
  track = false;

  public async run(dataSource: DataSource, factoryManager: SeederFactoryManager): Promise<void> {
    const maxBetAmount = Number(process.env.MAX_BET_AMOUNT);
    const minBetAmount = Number(process.env.MIN_BET_AMOUNT);

    // NOTE: please run this seeder between :05 - :55 minutes of the hour
    let startDate = new Date();
    let endDate = new Date(startDate);
    endDate.setUTCHours(startDate.getUTCHours() + 1, 0, 0, 0); // set endDate to nextHour:00:00 from current time

    // pre-created 100 game records
    let provider = new ethers.JsonRpcProvider(process.env.OPBNB_PROVIDER_RPC_URL);
    let core_contract = Core__factory.connect(process.env.CORE_CONTRACT_ADDRESS, provider);
    let currentEpoch = Number(await core_contract.currentEpoch());
    for (let epoch = currentEpoch; epoch < currentEpoch + 100; epoch++) {
      await dataSource
        .createQueryBuilder()
        .insert()
        .into('game')
        .values([{
          epoch: epoch.toString(),
          maxBetAmount: maxBetAmount,
          minBetAmount: minBetAmount,
          drawTxHash: null,
          startDate: startDate,
          endDate: endDate,
          isClosed: false,
        }])
        .execute();

      startDate = new Date(endDate);
      // start date is 1 seconds after previous endDate (endHour:00:01)
      startDate.setUTCSeconds(startDate.getUTCSeconds() + 1);
      endDate = new Date(startDate);
      // end date is 1 hour to whole hour(endHour:00:00) after startDate
      endDate.setUTCHours(startDate.getUTCHours() + 1, 0, 0, 0);
    }

    // set default prize algo
    await dataSource
      .createQueryBuilder()
      .insert()
      .into('prize_algo')
      .values([
        // max ticket
        { updatedBy: 'seeder', key: 'maxTicketPriority', value: null },
        { updatedBy: 'seeder', key: 'maxTicketFirstPrizeCount', value: null },
        { updatedBy: 'seeder', key: 'maxTicketSecondPrizeCount', value: null },
        { updatedBy: 'seeder', key: 'maxTicketThirdPrizeCount', value: null },
        { updatedBy: 'seeder', key: 'maxTicketSpecialPrizeCount', value: null },
        { updatedBy: 'seeder', key: 'maxTicketConsolationPrizeCount', value: null },
        { updatedBy: 'seeder', key: 'maxTicketStartEpoch', value: null },
        { updatedBy: 'seeder', key: 'maxTicketEndEpoch', value: null },
        // least first
        { updatedBy: 'seeder', key: 'leastFirstPriority', value: 1 },
        { updatedBy: 'seeder', key: 'leastFirstRandomLevel', value: 2 },
        { updatedBy: 'seeder', key: 'leastFirstStartEpoch', value: null },
        { updatedBy: 'seeder', key: 'leastFirstEndEpoch', value: null },
        // fixed number
        { updatedBy: 'seeder', key: 'fixedNumberPriority', value: null },
        { updatedBy: 'seeder', key: 'fixedNumberNumberPair', value: '8888' },
        { updatedBy: 'seeder', key: 'fixedNumberIndex', value: 0 },
        { updatedBy: 'seeder', key: 'fixedNumberStartEpoch', value: null },
        { updatedBy: 'seeder', key: 'fixedNumberEndEpoch', value: null },
        // allow prize
        { updatedBy: 'seeder', key: 'allowPrizePriority', value: null },
        { updatedBy: 'seeder', key: 'allowFirstPrize', value: true },
        { updatedBy: 'seeder', key: 'allowSecondPrize', value: true },
        { updatedBy: 'seeder', key: 'allowThirdPrize', value: true },
        { updatedBy: 'seeder', key: 'allowSpecialPrize', value: true },
        { updatedBy: 'seeder', key: 'allowSpecialPrizeCount', value: null },
        { updatedBy: 'seeder', key: 'allowConsolationPrize', value: true },
        { updatedBy: 'seeder', key: 'allowConsolationPrizeCount', value: null },
        { updatedBy: 'seeder', key: 'allowPrizeStartEpoch', value: null },
        { updatedBy: 'seeder', key: 'allowPrizeEndEpoch', value: null },
      ])
      .execute();
  }
}
