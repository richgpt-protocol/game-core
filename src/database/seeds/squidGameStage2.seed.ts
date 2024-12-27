import { Seeder } from 'typeorm-extension';
import { ethers } from 'ethers';
import { DataSource } from 'typeorm';

// please use lowercase if seedChar is not number
const seedChar: string = 'a';

// must match with the projectName in jackpot table
const projectName = 'FUYO X SQUID GAME - STAGE 2';

export type SQUID_GAME_STAGE_2 = {
  projectName: string;
  seedChar: string;
  hashedSeedChar: string;
  startTime: Date;
  endTime: Date;
  participantIsUpdated: boolean;
};

export default class SquidGameStage2 implements Seeder {
  /**
   * Track seeder execution.
   *
   * Default: false
   */
  track = false;

  public async run(dataSource: DataSource): Promise<void> {
    const project = await dataSource
      .createQueryBuilder()
      .select('jackpot')
      .from('jackpot', 'jackpot')
      .where('jackpot.projectName = :projectName', { projectName })
      .getOne();
    if (!project) {
      throw new Error('Project not found');
    }

    // computes UTF-8 bytes of seedString, computes the keccak256 and remove the 0x prefix
    const hashedSeedChar = ethers.id(seedChar).slice(2);

    // insert or update into setting table
    const result = await dataSource
      .createQueryBuilder()
      .insert()
      .into('setting')
      .values([
        {
          key: 'ENABLE_SQUID_GAME_STAGE_2',
          value: JSON.stringify({
            projectName,
            seedChar,
            hashedSeedChar,
            startTime: project.startTime,
            endTime: project.endTime,
            participantIsUpdated: false,
          } as SQUID_GAME_STAGE_2),
        },
      ])
      .orUpdate(['value'], ['key'])
      .execute();
    console.log(result);

    // log the hashedSeedChar
    console.log('Hashed seed char:', hashedSeedChar);
  }
}
// how to verify the hashed seed character?
// after announce the seed character, verify the hashed seed character with:
// https://emn178.github.io/online-tools/keccak_256.html
// input the seed character should get exactly same hashed seed character
