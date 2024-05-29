import { Test, TestingModule } from '@nestjs/testing';
import { BackOfficeService } from './back-office.service';

describe('BackOfficeService', () => {
  let service: BackOfficeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BackOfficeService],
    }).compile();

    service = module.get<BackOfficeService>(BackOfficeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
