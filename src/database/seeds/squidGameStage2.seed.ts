import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { ethers } from 'ethers';
import { DataSource } from 'typeorm';

const seedChar: string = '9';
const seedString: string = `The seed character for FUYO X SQUID GAME - STAGE 2 is: ${seedChar}`;

const projectName = 'FUYO X SQUID GAME - STAGE 2'; // to fetch startTime & endTime

export type SQUID_GAME_STAGE_2 = {
  seedChar: string;
  seedString: string;
  hashedSeedString: string;
  startTime: Date;
  endTime: Date;
};

export enum SQUID_GAME_PARTICIPANT_STATUS {
  STAGE_2_SUCCESS = 'STAGE_2_SUCCESS',
  STAGE_2_FAILED = 'STAGE_2_FAILED',
  STAGE_2_ALREADY_SUCCESS = 'STAGE_2_ALREADY_SUCCESS',
}

export default class SquidGameStage2 implements Seeder {
  /**
   * Track seeder execution.
   *
   * Default: false
   */
  track = false;

  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    const project = await dataSource
      .createQueryBuilder()
      .select('jackpot')
      .from('jackpot', 'jackpot')
      .where('jackpot.projectName = :projectName', { projectName })
      .getOne();
    if (!project) {
      throw new Error('Project not found');
    }

    // computes UTF-8 bytes of seedString and computes the keccak256
    const hashedSeedString = ethers.id(seedString);

    // insert or update into setting table
    const result = await dataSource
      .createQueryBuilder()
      .insert()
      .into('setting')
      .values([
        {
          key: 'ENABLE_SQUID_GAME_STAGE_2',
          value: JSON.stringify({
            seedChar,
            seedString,
            hashedSeedString,
            startTime: project.startTime,
            endTime: project.endTime,
          } as SQUID_GAME_STAGE_2),
        },
      ])
      .orUpdate(['value'], ['key'])
      .execute();
    console.log(result);

    // log the hashedSeedString
    console.log('Hashed seed string:', hashedSeedString);
  }
}
// how to verify the hashed seed string?
// after announce the seed character, verify the hashed seed string with:
// ethers.id('The seed character for FUYO X SQUID GAME - STAGE 2 is: <seed character>')
// the result should be exactly same as the hashed seed string
