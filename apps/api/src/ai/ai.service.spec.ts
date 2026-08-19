import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';
import { ConfigService } from '@nestjs/config';

describe('AiService', () => {
  let service: AiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test_gemini_key'),
          },
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should extract mock product details when no real key is provided', async () => {
    const result = await service.extractProductDetails('Nike Air Max 270\nPrice: Rs 24,999');
    expect(result.productName).toBe('Mock Product');
    expect(result.price).toBe('Rs. 1000');
  });

  it('should generate mock captions when no real key is provided', async () => {
    const result = await service.generateCaptions({});
    expect(result.instagram).toBe('Mock IG Caption');
    expect(result.facebook).toBe('Mock FB Caption');
    expect(result.story).toBe('Mock Story');
  });
});
