import { Seeder } from 'typeorm-extension';
import { DataSource, InsertResult, UpdateResult } from 'typeorm';
import { ethers } from 'ethers';
import { Jackpot__factory } from '../../contract';

// game.service.setSquidGameJackpotHash() relies on projectName, startTime and endTime to determine time to set squid game jackpot hash on-chain
export const projectName = 'CNY Jackpot'; // to update, must be exactly same as contract
export const startTime = '2025-01-25 18:06:40'; // to update, in UTC
export const endTime = '2025-02-02 18:06:39'; // to update, in UTC
const minimumBetAmount = 2;
const PROVIDER_RPC_URL =
  'https://opbnb-testnet.nodereal.io/v1/8e5337e061dc418eaca1cc8236ba566a'; // to update
const JACKPOT_CONTRACT_ADDRESS = '0xefAC622CeDf2fe4DC42e175a0105E63b22C67C41'; // to update

export default class CreateJackpot implements Seeder {
  /**
   * Track seeder execution.
   *
   * Default: false
   */
  track = false;

  public async run(dataSource: DataSource): Promise<void> {
    // fetch current round from contract
    const provider = new ethers.JsonRpcProvider(PROVIDER_RPC_URL);
    const jackpotContract = Jackpot__factory.connect(
      JACKPOT_CONTRACT_ADDRESS,
      provider,
    );
    const squidGameStage4Project = await jackpotContract.projects(projectName);

    const jackpotData = {
      round: Number(squidGameStage4Project.currentRound),
      projectName: projectName,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      duration:
        (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000,
      minimumBetAmount: minimumBetAmount,
      feeTokenAddress: '0x0000000000000000000000000000000000000000',
      feeAmount: 0,
    };

    const existingRecord = await dataSource
      .createQueryBuilder()
      .select('jackpot')
      .from('jackpot', 'jackpot')
      .where('jackpot.round = :round', {
        round: Number(squidGameStage4Project.currentRound),
      })
      .andWhere('jackpot.projectName = :projectName', { projectName })
      .getOne();

    let result: InsertResult | UpdateResult;
    if (existingRecord) {
      // Update existing record
      result = await dataSource
        .createQueryBuilder()
        .update('jackpot')
        .set(jackpotData)
        .where('round = :round', {
          round: Number(squidGameStage4Project.currentRound),
        })
        .andWhere('projectName = :projectName', { projectName })
        .execute();
    } else {
      // Insert new record
      result = await dataSource
        .createQueryBuilder()
        .insert()
        .into('jackpot')
        .values([jackpotData])
        .execute();
    }
    console.log(result);
  }
}
// npm run seed:run -- -n src/database/seeds/jackpot.seed.ts
