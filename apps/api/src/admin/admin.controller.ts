import {
  Controller,
  Get,
  UseGuards,
  Patch,
  Param,
  Body,
  Post,
  Query,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { OwnerGuard } from '../auth/guards/owner.guard';
import { AdminAuthenticatedRequest } from '../auth/authenticated-request';
import {
  ExtendTrialDto,
  SetPaidDto,
  SetRoleDto,
  UpdateStorageLimitDto,
} from './dto/admin.dto';

@Controller('api/admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /** The signed-in admin's own identity + role (drives the console UI). */
  @Get('me')
  async getMe(@Request() req: AdminAuthenticatedRequest) {
    return this.adminService.getMe(req.dbUser.id);
  }

  @Get('stats')
  async getStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('users')
  async getUsers(
    @Query('search') search?: string,
    @Query('filter') filter?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.adminService.getUsers({
      search: search || undefined,
      filter: filter || undefined,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get('users/:id')
  async getUserDetail(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  @Post('users/:id/extend-trial')
  async extendTrial(
    @Request() req: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ExtendTrialDto,
  ) {
    return this.adminService.extendTrial(req.dbUser, id, Number(body?.days));
  }

  @Post('users/:id/paid')
  async setPaid(
    @Request() req: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SetPaidDto,
  ) {
    if (typeof body?.isPaid !== 'boolean') {
      throw new BadRequestException('isPaid must be a boolean');
    }
    return this.adminService.setPaid(req.dbUser, id, body.isPaid);
  }

  @Patch('users/:id/block')
  async toggleBlockStatus(
    @Request() req: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body('isBlocked') isBlocked: boolean,
  ) {
    return this.adminService.toggleBlockStatus(req.dbUser, id, !!isBlocked);
  }

  @Post('users/:id/storage')
  async updateStorageLimit(
    @Request() req: AdminAuthenticatedRequest,
    @Param('id') userId: string,
    @Body() body: UpdateStorageLimitDto,
  ) {
    if (!body.storageLimitBytes || body.storageLimitBytes < 0) {
      throw new BadRequestException('Invalid storage limit');
    }
    return this.adminService.updateStorageLimit(
      req.dbUser,
      userId,
      body.storageLimitBytes,
    );
  }

  // ------------------------------------------------------------- team
  @Get('team')
  async getTeam() {
    return this.adminService.getTeam();
  }

  /**
   * Role management is OWNER-only: admins can operate the console but
   * can never create or remove admins. Enforced again in the service.
   */
  @Post('team/role')
  @UseGuards(OwnerGuard)
  async setRole(
    @Request() req: AdminAuthenticatedRequest,
    @Body() body: SetRoleDto,
  ) {
    if (!body?.userId || !body?.role) {
      throw new BadRequestException('userId and role are required');
    }
    return this.adminService.setRole(req.dbUser, body.userId, body.role);
  }

  // ------------------------------------------------------------ system
  @Get('audit')
  async getAudit(@Query('limit') limit?: string) {
    return this.adminService.getAudit(limit ? parseInt(limit, 10) : 50);
  }

  @Get('system')
  async getSystem() {
    return this.adminService.getSystemHealth();
  }
}
