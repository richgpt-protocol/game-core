import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CacheSettingService } from 'src/shared/services/cache-setting.service';
import { Connection, Repository } from 'typeorm';
import { SettingDto } from './dto/setting.dto';
import { Setting } from './entities/setting.entity';

@Injectable()
export class SettingService implements OnModuleInit {
  constructor(
    @InjectRepository(Setting)
    private settingRepository: Repository<Setting>,
    private connection: Connection,
    private cacheSettingService: CacheSettingService,
  ) {}

  async reloadSettingCache() {
    // Reload all setting caches
    // await this.emailService.onModuleInit();
  }

  async onModuleInit() {
    /*** Initialize load to cache when bootstrapping ***/
    await this.initLoad();
  }

  async initLoad() {
    this.cacheSettingService.clear();
    const setting = await this.getAllSettings();
    setting.forEach((s) => {
      this.cacheSettingService.set(s.key, s.value);
    });
  }

  async getAllSettings() {
    return this.settingRepository.find();
  }

  async getKeyValue(key: string) {
    return this.settingRepository.findOneBy({
      key,
    });
  }

  async update(payload: SettingDto) {
    const queryRunner = this.connection.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      payload.details.forEach(async (k) => {
        const key = await this.getKeyValue(k.key);
        if (key) {
          key.value = k.value;
          await queryRunner.manager.save(key);
        }
      });
      await queryRunner.commitTransaction();

      await this.initLoad();
      await this.reloadSettingCache();
      return;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(err.message);
    } finally {
      await queryRunner.release();
    }
  }
}
