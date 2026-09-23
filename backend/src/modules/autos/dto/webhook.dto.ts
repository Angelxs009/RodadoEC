import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';
import { WebhookEvent } from '../entities/webhook-subscription.entity';

const EVENT_VALUES = Object.values(WebhookEvent);

export class WebhookSubscriptionDto {
  @ApiProperty({ format: 'uuid' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ format: 'uri' })
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  url: string;

  @ApiProperty({ enum: EVENT_VALUES, isArray: true })
  @IsArray()
  @IsIn(EVENT_VALUES, { each: true })
  events: WebhookEvent[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secret?: string;
}

export class WebhookPayloadDto {
  @ApiProperty({ format: 'uuid' })
  eventId: string;

  @ApiProperty()
  eventType: string;

  @ApiProperty()
  timestamp: string;

  @ApiProperty()
  resourceId: string;

  @ApiPropertyOptional()
  data?: Record<string, unknown>;
}
