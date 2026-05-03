import { Module } from '@nestjs/common';
import { ClerkOrganizationsController } from './clerk-organizations.controller';
import { ClerkOrganizationsService } from './clerk-organizations.service';

@Module({
  controllers: [ClerkOrganizationsController],
  providers: [ClerkOrganizationsService],
})
export class ClerkWebhooksModule {}
