import { Seeder } from 'typeorm-extension';
import { ethers } from 'ethers';
import { DataSource } from 'typeorm';

// please use lowercase if seedChar is not number
const seedChar: string = 'F';
const serverSeed = ethers.hexlify(ethers.randomBytes(32)).slice(2); // a random 32 bytes hex string without 0x prefix
const seedString: string = `The qualified end character for Fuyo x Squid Game - stage 2 is: ${seedChar}`;

// must match with the projectName in jackpot table
const projectName = 'FUYO X SQUID GAME - STAGE 2';

export type SQUID_GAME_STAGE_2 = {
  projectName: string;
  seedChar: string;
  hashedSeedStringWithServerSeed: string;
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
    const hashedSeedString = ethers.id(seedString).slice(2);
    // append hashedSeedString with an empty space and follow by serverSeed, compute the keccak256 and remove the 0x prefix
    const hashedSeedStringWithServerSeed = ethers
      .id(hashedSeedString + ' ' + serverSeed)
      .slice(30);

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
            hashedSeedStringWithServerSeed,
            startTime: project.startTime,
            endTime: project.endTime,
            participantIsUpdated: false,
          } as SQUID_GAME_STAGE_2),
        },
      ])
      .orUpdate(['value'], ['key'])
      .execute();
    console.log(result);

    // log the seedString and hashedSeedString
    console.log('Seed string:', seedString);
    console.log('Hashed seed string:', hashedSeedString);
    console.log(
      'Server seed(this is random value, must record down else cannot verify hashedSeedStringWithServerSeed again):',
      serverSeed,
    );
    console.log(
      'Hashed seed string with server seed:',
      hashedSeedStringWithServerSeed,
    );
  }
}
// how to verify the hashed seed string?
// after announce the seed string, verify the hashed seed string with:
// https://emn178.github.io/online-tools/keccak_256.html
// input the seed string should get exactly same hashed seed string
