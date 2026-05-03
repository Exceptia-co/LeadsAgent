import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clerk } from '@clerk/backend';
import { PrismaService } from '../prisma/prisma.service';
import {
  ClerkDeletedOrganizationData,
  ClerkOrganizationData,
  ClerkOrganizationWebhookEvent,
} from './clerk-organization.types';

type ClerkClient = ReturnType<typeof Clerk>;

@Injectable()
export class ClerkOrganizationsService {
  private readonly logger = new Logger(ClerkOrganizationsService.name);
  private clerkClient?: ClerkClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async handleWebhook(event: ClerkOrganizationWebhookEvent): Promise<{
    action: 'synced' | 'deleted' | 'ignored';
    tenantId?: string;
  }> {
    switch (event.type) {
      case 'organization.created':
      case 'organization.updated':
        return this.syncOrganization(event.data as ClerkOrganizationData);

      case 'organization.deleted':
        return this.deleteOrganization(event.data as ClerkDeletedOrganizationData);

      default:
        this.logger.warn(`Unhandled Clerk organization event: ${event.type}`);
        return { action: 'ignored' };
    }
  }

  private async syncOrganization(data: ClerkOrganizationData): Promise<{
    action: 'synced';
    tenantId: string;
  }> {
    if (!data.id) {
      throw new Error('Clerk organization webhook is missing data.id');
    }

    const name = this.resolveTenantName(data);
    const tenant = await this.prisma.tenant.upsert({
      where: { clerkOrgId: data.id },
      create: {
        clerkOrgId: data.id,
        name,
      },
      update: {
        name,
      },
    });

    await this.ensureClerkTenantMetadata(data, tenant.id);

    this.logger.log(
      `Synced Clerk organization ${data.id} to tenant ${tenant.id}`,
    );

    return { action: 'synced', tenantId: tenant.id };
  }

  private async deleteOrganization(
    data: ClerkDeletedOrganizationData,
  ): Promise<{ action: 'deleted' }> {
    if (!data.id) {
      throw new Error('Clerk organization deletion webhook is missing data.id');
    }

    await this.prisma.tenant.deleteMany({
      where: { clerkOrgId: data.id },
    });

    this.logger.log(`Deleted local tenant for Clerk organization ${data.id}`);

    return { action: 'deleted' };
  }

  private async ensureClerkTenantMetadata(
    data: ClerkOrganizationData,
    tenantId: string,
  ): Promise<void> {
    if (data.public_metadata?.tenant_id === tenantId) {
      return;
    }

    await this.getClerkClient().organizations.updateOrganizationMetadata(
      data.id,
      {
        publicMetadata: {
          tenant_id: tenantId,
        },
      },
    );
  }

  private getClerkClient(): ClerkClient {
    if (this.clerkClient) {
      return this.clerkClient;
    }

    const apiKey = this.configService.get<string>('CLERK_SECRET_KEY');
    if (!apiKey) {
      throw new Error('CLERK_SECRET_KEY is required to patch Clerk metadata');
    }

    this.clerkClient = Clerk({ apiKey });
    return this.clerkClient;
  }

  private resolveTenantName(data: ClerkOrganizationData): string {
    const name = data.name?.trim() || data.slug?.trim() || data.id;
    return name.slice(0, 255);
  }
}
