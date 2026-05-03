import {
  BadRequestException,
  Controller,
  InternalServerErrorException,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Webhook } from 'svix';
import { ClerkOrganizationsService } from './clerk-organizations.service';
import { ClerkOrganizationWebhookEvent } from './clerk-organization.types';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('api/webhooks/clerk/organizations')
export class ClerkOrganizationsController {
  private readonly logger = new Logger(ClerkOrganizationsController.name);

  constructor(
    private readonly clerkOrganizationsService: ClerkOrganizationsService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  async handleOrganizationWebhook(@Req() request: RawBodyRequest) {
    const payload = request.rawBody;
    if (!payload) {
      throw new BadRequestException('Missing raw body for Clerk webhook');
    }

    const webhookSecret = this.configService.get<string>(
      'CLERK_ORG_WEBHOOK_SECRET',
    );
    if (!webhookSecret) {
      throw new InternalServerErrorException(
        'CLERK_ORG_WEBHOOK_SECRET is not configured',
      );
    }

    const event = this.verifyWebhook(payload, request.headers, webhookSecret);

    this.logger.log(`Clerk organization webhook received: ${event.type}`);
    const result = await this.clerkOrganizationsService.handleWebhook(event);

    return {
      success: true,
      data: result,
    };
  }

  private verifyWebhook(
    payload: Buffer,
    headers: Request['headers'],
    webhookSecret: string,
  ): ClerkOrganizationWebhookEvent {
    const svixId = this.getHeader(headers, 'svix-id');
    const svixTimestamp = this.getHeader(headers, 'svix-timestamp');
    const svixSignature = this.getHeader(headers, 'svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new BadRequestException('Missing Svix webhook headers');
    }

    try {
      return new Webhook(webhookSecret).verify(payload, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as ClerkOrganizationWebhookEvent;
    } catch (error) {
      this.logger.warn(`Invalid Clerk organization webhook signature`);
      throw new BadRequestException('Invalid Clerk webhook signature');
    }
  }

  private getHeader(
    headers: Request['headers'],
    name: string,
  ): string | undefined {
    const value = headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }
}
