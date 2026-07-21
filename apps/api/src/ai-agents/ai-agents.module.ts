import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiAgentsController } from './ai-agents.controller';
import { AiAgentsService } from './ai-agents.service';

@Module({
  imports: [AuthModule],
  controllers: [AiAgentsController],
  providers: [AiAgentsService],
  exports: [AiAgentsService],
})
export class AiAgentsModule {}
