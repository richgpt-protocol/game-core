/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
// import { BetDto } from './dto/bet.dto';
// import { Bet } from './entities/bet.entity';
import { Repository } from 'typeorm';

@Injectable()
export class PayoutService {

  constructor(
    // @InjectRepository(Bet)
    // private userRepository: Repository<Bet>,
  ) {}
}
