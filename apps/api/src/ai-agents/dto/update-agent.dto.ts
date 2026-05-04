import { IsString, IsOptional, IsBoolean, IsInt, IsEnum, MaxLength, Min } from 'class-validator';

enum AgentTone {
  FORMAL = 'FORMAL',
  CASUAL = 'CASUAL',
  FRIENDLY = 'FRIENDLY',
  TECHNICAL = 'TECHNICAL',
}

enum PrimaryGoal {
  REGISTER = 'REGISTER',
  PURCHASE = 'PURCHASE',
  MEETING = 'MEETING',
  CONTACT = 'CONTACT',
  CUSTOM = 'CUSTOM',
}

export class UpdateAgentDto {
  @IsOptional() @IsString() @MaxLength(255)
  name?: string;

  @IsOptional() @IsString() @MaxLength(255)
  businessName?: string;

  @IsOptional() @IsString() @MaxLength(255)
  industry?: string;

  @IsOptional() @IsString() @MaxLength(500)
  websiteUrl?: string;

  @IsOptional() @IsString() @MaxLength(500)
  logoUrl?: string;

  @IsOptional()
  businessHours?: any;

  @IsOptional() @IsString() @MaxLength(255)
  personaName?: string;

  @IsOptional() @IsEnum(AgentTone)
  tone?: AgentTone;

  @IsOptional() @IsString() @MaxLength(10)
  language?: string;

  @IsOptional() @IsString() @MaxLength(5000)
  customInstructions?: string;

  @IsOptional() @IsInt() @Min(10)
  responseMaxWords?: number;

  @IsOptional() @IsBoolean()
  allowEmojis?: boolean;

  @IsOptional() @IsEnum(PrimaryGoal)
  primaryGoal?: PrimaryGoal;

  @IsOptional() @IsString() @MaxLength(500)
  goalCtaUrl?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  goalDescription?: string;

  @IsOptional() @IsString() @MaxLength(50)
  llmProvider?: string;

  @IsOptional() @IsString() @MaxLength(100)
  llmModel?: string;

  @IsOptional() @IsBoolean()
  enableStructuredExtraction?: boolean;
}
