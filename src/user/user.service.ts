/* eslint-disable @typescript-eslint/no-unused-vars */
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Connection, Like, Repository } from 'typeorm';
import { GetUsersDto, RegisterUserDto } from './dto/register-user.dto';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { RandomUtil } from 'src/shared/utils/random.util';
import { UserStatus } from 'src/shared/enum/status.enum';
import { UserRole } from 'src/shared/enum/role.enum';
import { Provider } from 'src/shared/enum/provider.enum';
import { UtilConstant } from 'src/shared/constants/util.constant';
import { buildFilterCriterias } from 'src/shared/utils/pagination.util';
import { ObjectUtil } from 'src/shared/utils/object.util';
import { DateUtil } from 'src/shared/utils/date.util';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private connection: Connection,
  ) {}

  async findOne(id: number) {
    return await this.userRepository
      .createQueryBuilder('row')
      .select('row')
      .addSelect('row.password')
      .addSelect('row.isReset')
      .addSelect('row.verificationCode')
      .addSelect('row.loginAttempt')
      .where({
        id,
      })
      .getOne();
  }

  async findOneWithoutHiddenFields(id) {
    return await this.userRepository.findOneBy(id);
  }

  async findReferralCodeWithoutHiddenFields(code: string) {
    return await this.userRepository.findOneBy({
      referralCode: code,
    });
  }

  async findByEmail(email: string) {
    return await this.userRepository
      .createQueryBuilder('row')
      .select('row')
      .addSelect('row.password')
      .addSelect('row.isReset')
      .addSelect('row.verificationCode')
      .addSelect('row.loginAttempt')
      .where({
        emailAddress: email,
      })
      .getOne();
  }

  async findByCriteria(key: string, value: string) {
    const query = await this.userRepository
      .createQueryBuilder('row')
      .select('row')
      .addSelect('row.password')
      .addSelect('row.isReset')
      .addSelect('row.verificationCode')
      .addSelect('row.loginAttempt')
      .where({
        [key]: value,
      })
      .getOne();

    return query;
  }

  async findBySocialInfo(email: string, id: string, provider: string) {
    switch (provider) {
      case Provider.GOOGLE:
        return await this.userRepository
          .createQueryBuilder('row')
          .select('row')
          .addSelect('row.password')
          .addSelect('row.isReset')
          .addSelect('row.verificationCode')
          .addSelect('row.loginAttempt')
          .where({
            emailAddress: email,
            googleToken: id,
          })
          .getOne();
      default:
        return null;
    }
  }

  async getUserInfo(id: number) {
    const { password, verificationCode, ...result } =
      await this.userRepository.findOneBy({
        id,
      });
    return result;
  }

  async register(payload: RegisterUserDto) {
    const condition = {
      phoneNumber: payload.phoneNumber,
    };
    for await (const c of Object.keys(condition)) {
      const res = await this.findByCriteria(c, condition[c]);
      if (res && condition[c]) {
        switch (c) {
          case 'phoneNumber':
            throw new BadRequestException('user.PHONENO_EXIST');
        }
      }
    }

    if (payload.referralCode) {
      const referralUser = await this.findReferralCodeWithoutHiddenFields(
        payload.referralCode,
      );

      if (!referralUser) {
        throw new BadRequestException('user.REFERAL_INVALID');
      }
    }

    // const hashed = await bcrypt.hash(payload.password, 10);
    const result = await this.userRepository.save(
      this.userRepository.create({
        ...payload,
        password: payload.password, // Frontend do encryption
        loginAttempt: 0,
        // status: UserStatus.UNVERIFIED, // TODO will do email verification next milestone
        status: UserStatus.ACTIVE,
        isReset: false,
      }),
    );

    await this.update(result.id, {
      referralCode: this.generateReferralCode(result.id),
    });

    // Temporary hide
    // await this.emailService.sendWelcomeEmail(
    //   UserRole.USER,
    //   result.emailAddress,
    //   result.id.toString(),
    //   result.firstName,
    // );
    return result;
  }

  async oauthRegister(
    email: string,
    lastName: string,
    firstName: string,
    picUrl: string,
    token: string,
    provider: string,
  ) {
    let result;
    switch (provider) {
      case Provider.GOOGLE:
        result = await this.userRepository.save(
          this.userRepository.create({
            loginAttempt: 0,
            status: UserStatus.UNVERIFIED,
            isReset: false,
          }),
        );
        break;
    }

    if (result) {
      await this.update(result.id, {
        referralCode: this.generateReferralCode(result.id),
      });

      // await this.emailService.sendWelcomeEmail(
      //   UserRole.USER,
      //   result.emailAddress,
      //   result.id.toString(),
      //   result.name,
      // );
    }
    return result;
  }

  async update(id: number, payload: any) {
    return await this.userRepository.update(id, {
      ...payload,
      updatedBy: UtilConstant.SELF,
    });
  }

  async verifyOtp(code: string, userId: number) {
    return await this.userRepository.findOneBy({
      verificationCode: code,
      id: userId,
    });
  }

  async getUsers(payload: GetUsersDto) {
    if (payload.orderBy != null && payload.orderBy != '') {
      payload.orderBy = 'user.' + payload.orderBy;
    }

    const { pagination, order } = buildFilterCriterias(payload);

    let query = this.userRepository.createQueryBuilder('user');

    if (payload.status != null && payload.status.length > 0) {
      query = query.andWhere(
        new Brackets((qb) => {
          qb.where('status IN (:...status)', {
            status: payload.status,
          });
        }),
      );
    }

    if (payload.keyword != null && payload.keyword != '') {
      query = query.andWhere(
        new Brackets((qb) => {
          qb.where('user.firstName LIKE :firstName', {
            firstName: `%${payload.keyword}%`,
          })
            .orWhere('user.referralCode LIKE :referralCode', {
              referralCode: `%${payload.keyword}%`,
            })
            .orWhere('user.phoneNumber LIKE :phoneNumber', {
              phoneNumber: `%${payload.keyword}%`,
            });
        }),
      );
    }

    if (payload.fromDate != null && payload.fromDate != '') {
      query = query.andWhere('user.createdDate >= :fromDate', {
        fromDate: payload.fromDate,
      });
    }

    if (payload.toDate != null && payload.toDate != '') {
      const toDate = DateUtil.formatDate(
        DateUtil.addDays(DateUtil.parseStringtoDate(payload.toDate), 1),
        'YYYY-MM-DD',
      );
      query = query.andWhere('user.createdDate <= :toDate', {
        toDate,
      });
    }

    return await query
      .take(ObjectUtil.isEmpty(pagination) ? null : pagination.take)
      .skip(ObjectUtil.isEmpty(pagination) ? null : pagination.skip)
      .orderBy(order)
      .getManyAndCount();
  }

  private generateReferralCode(id: number) {
    return RandomUtil.generateRandomCode(8) + id;
  }

  private async verifyPassword(
    plainTextPassword: string,
    hashedPassword: string,
  ) {
    const isMatched = await bcrypt.compare(plainTextPassword, hashedPassword);
    return isMatched;
  }
}
