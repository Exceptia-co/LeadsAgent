export type ClerkOrganizationWebhookType =
  | 'organization.created'
  | 'organization.updated'
  | 'organization.deleted';

export interface ClerkOrganizationData {
  id: string;
  name?: string | null;
  slug?: string | null;
  public_metadata?: Record<string, unknown> | null;
}

export interface ClerkDeletedOrganizationData {
  id: string;
  deleted?: boolean;
}

export interface ClerkOrganizationWebhookEvent {
  type: ClerkOrganizationWebhookType;
  data: ClerkOrganizationData | ClerkDeletedOrganizationData;
}
