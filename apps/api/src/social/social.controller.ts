import { Controller, Get, Query, Req, Res, UseGuards, Request, Delete } from '@nestjs/common';
import { Response } from 'express';
import { SocialService } from './social.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/social')
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @UseGuards(JwtAuthGuard)
  @Get('oauth/facebook')
  getOAuthUrl(@Request() req: any) {
    const url = this.socialService.getMetaOAuthUrl(req.user.userId);
    return { url };
  }

  // This endpoint receives the callback from Meta, it won't have the JWT header,
  // so we encode the userId in the state parameter.
  @Get('oauth/facebook/callback')
  async handleOAuthCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state' });
    }
    
    try {
      await this.socialService.handleMetaOAuthCallback(code, state);
      // Redirect to the frontend settings on success
      return res.redirect('http://localhost:3000/settings?social=success');
    } catch (err: any) {
      return res.redirect(`http://localhost:3000/settings?social=error&message=${encodeURIComponent(err.message)}`);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('accounts')
  async getAccounts(@Request() req: any) {
    return this.socialService.getSocialAccounts(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('disconnect')
  async disconnectMeta(@Request() req: any) {
    return this.socialService.disconnectMeta(req.user.userId);
  }
}
