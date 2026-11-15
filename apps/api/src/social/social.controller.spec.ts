import { Test, TestingModule } from '@nestjs/testing';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';

describe('SocialController', () => {
  let controller: SocialController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SocialController],
      providers: [
        {
          provide: SocialService,
          useValue: {
            getMetaOAuthUrl: jest.fn(),
            handleMetaOAuthCallback: jest.fn(),
            getSocialAccounts: jest.fn().mockResolvedValue([]),
            disconnectMeta: jest.fn().mockResolvedValue({ success: true }),
            listMetaPages: jest.fn().mockResolvedValue([]),
            saveMetaDestination: jest.fn().mockResolvedValue({ success: true }),
          },
        },
      ],
    }).compile();

    controller = module.get<SocialController>(SocialController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
