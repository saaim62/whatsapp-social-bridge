import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  Request,
  Delete,
} from '@nestjs/common';
import { Response } from 'express';
import { SocialService } from './social.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/social')
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @UseGuards(JwtAuthGuard)
  @Get('oauth/facebook')
  async getOAuthUrl(@Request() req: any) {
    const url = await this.socialService.getMetaOAuthUrl(req.user.userId);
    return { url };
  }

  // This endpoint receives the callback from Meta, so it has no JWT header.
  // The state parameter is a server-side nonce bound to the initiating user
  // (see SocialService.getMetaOAuthUrl) — it carries no user data itself.
  @Get('oauth/facebook/callback')
  async handleOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state' });
    }

    try {
      await this.socialService.handleMetaOAuthCallback(code, state);
      // Redirect to the frontend settings on success
      const frontendUrl =
        process.env.FRONTEND_URL || 'http://130.110.113.71:3000';
      return res.redirect(`${frontendUrl}/settings?social=success`);
    } catch (err: any) {
      const frontendUrl =
        process.env.FRONTEND_URL || 'http://130.110.113.71:3000';
      return res.redirect(
        `${frontendUrl}/settings?social=error&message=${encodeURIComponent(err.message)}`,
      );
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

  // The connected account's Facebook Pages (+ linked Instagram
  // accounts) — the choices for the publishing-destination picker.
  @UseGuards(JwtAuthGuard)
  @Get('meta/pages')
  async listMetaPages(@Request() req: any) {
    return this.socialService.listMetaPages(req.user.userId);
  }

  // Save the user's chosen publishing destination. Publishing uses
  // ONLY this destination (see SocialService.getMetaPublishingContext).
  @UseGuards(JwtAuthGuard)
  @Post('meta/destination')
  async saveMetaDestination(
    @Request() req: any,
    @Body() body: { pageId: string; instagramAccountId?: string | null },
  ) {
    if (!body?.pageId) {
      return { success: false, message: 'pageId is required' };
    }
    return this.socialService.saveMetaDestination(
      req.user.userId,
      body.pageId,
      body.instagramAccountId ?? null,
    );
  }
}
