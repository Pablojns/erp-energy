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
import { EngravingController } from './engraving/engraving.controller';
import { EngravingService } from './engraving/engraving.service';

@Module({
  imports: [PrismaModule, AuthModule, PermissionsModule, CrmModule],
  // Importante: registrar primeiro o engraving (rota fixa /engraving)
  // para não deixar Express resolver /api/quotes/engraving como /api/quotes/:id.
  controllers: [EngravingController, QuotesController],
  providers: [
    QuotesService,
    XbzIntegrationService,
    SpotIntegrationService,
    QuoteProposalService,
    MailService,
    EngravingService,
  ],
  exports: [
    QuotesService,
    XbzIntegrationService,
    SpotIntegrationService,
    QuoteProposalService,
  ],
})
export class QuotesModule {}
