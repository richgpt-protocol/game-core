import { Test, TestingModule } from '@nestjs/testing';
import { BackOfficeController } from './back-office.controller';

describe('BackOfficeController', () => {
  let controller: BackOfficeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BackOfficeController],
    }).compile();

    controller = module.get<BackOfficeController>(BackOfficeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
