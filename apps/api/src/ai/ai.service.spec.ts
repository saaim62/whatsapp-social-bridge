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

  it('should fall back to heuristic extraction (snake_case contract) when no real key is provided', async () => {
    // The ConfigService mock returns 'test_gemini_key' for every key,
    // which AiService treats as "no key configured" — so extraction
    // takes the heuristic path. The service contract is snake_case
    // (product_name / price / features), the same shape the LLM path
    // returns and the batch processor consumes.
    const result = await service.extractProductDetails(
      'Nike Air Max 270\nPrice: Rs 24,999',
    );
    expect(result.product_name).toBe('Nike Air Max 270');
    expect(result.price).toBe('Rs. 24,999');
  });

  it('should generate mock captions when no real key is provided', async () => {
    const result = await service.generateCaptions({});
    expect(result.instagramCaption).toBe('Mock IG Caption');
    expect(result.facebookCaption).toBe('Mock FB Caption');
    expect(result.storyText).toBe('Mock Story');
  });
});
