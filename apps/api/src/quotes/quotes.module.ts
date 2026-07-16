import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../common/permissions/permissions.module';
import { CrmModule } from '../crm/crm.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MailService } from './mail.service';
import { QuoteProposalService } from './quote-proposal.service';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { SpotIntegrationService } from './spot-integration.service';
import { XbzIntegrationService } from './xbz-integration.service';

@Module({
  imports: [PrismaModule, AuthModule, PermissionsModule, CrmModule],
  controllers: [QuotesController],
  providers: [
    QuotesService,
    XbzIntegrationService,
    SpotIntegrationService,
    QuoteProposalService,
    MailService,
  ],
  exports: [
    QuotesService,
    XbzIntegrationService,
    SpotIntegrationService,
    QuoteProposalService,
  ],
})
export class QuotesModule {}
