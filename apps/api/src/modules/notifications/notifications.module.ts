import { Inject, Module, OnModuleDestroy, OnModuleInit } from "@nestjs/common";

import { InfrastructureModule } from "../../infra/infra.module";
import { JobsService, getBoss } from "../../infra/jobs/boss";
import { env } from "../../config/env";
import {
  EmailService,
  EMAIL_QUEUE,
  identitySenders,
  type EmailJobPayload,
} from "./application/email-service";
import { NotificationsService } from "./application/notifications-service";
import { NotificationsController } from "./presentation/notifications.controller";

/** DI tokens (exported for consumer modules; defined in ./tokens to keep the
 *  module/service import graph acyclic). */
export { EMAIL_SERVICE, IDENTITY_EMAIL_SENDERS, NOTIFICATIONS_SERVICE } from "./tokens";
import { EMAIL_SERVICE, IDENTITY_EMAIL_SENDERS, NOTIFICATIONS_SERVICE } from "./tokens";
export type { IdentityEmailSenders } from "./application/email-service";

/**
 * Notifications module (PHASE-003 email adapter + PHASE-014 T10 in-app
 * center): the email queue handler runs on both API and worker processes;
 * the inbox/preferences REST surface is tenant-plane. Imports no other
 * business module — callers (tenancy/reporting/sales) resolve owner emails
 * themselves and pass them in (the identity→notifications edge already
 * exists, so notifications→identity would be a boundary cycle).
 */
@Module({
  imports: [InfrastructureModule],
  controllers: [NotificationsController],
  providers: [
    {
      provide: EMAIL_SERVICE,
      useFactory: (jobs: JobsService) =>
        new EmailService({
          jobs,
          webBaseUrl: env.WEB_BASE_URL,
          fromAddress: env.SMTP_FROM,
        }),
      inject: [JobsService],
    },
    {
      provide: IDENTITY_EMAIL_SENDERS,
      useFactory: (email: EmailService) => identitySenders(email, env.WEB_BASE_URL),
      inject: [EMAIL_SERVICE],
    },
    NotificationsService,
    { provide: NOTIFICATIONS_SERVICE, useExisting: NotificationsService },
  ],
  exports: [EMAIL_SERVICE, IDENTITY_EMAIL_SENDERS, NotificationsService, NOTIFICATIONS_SERVICE],
})
export class NotificationsModule implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(EMAIL_SERVICE) private readonly email: EmailService) {}

  async onModuleInit(): Promise<void> {
    const boss = getBoss();
    await boss.work<EmailJobPayload>(EMAIL_QUEUE, async (jobs) => {
      // pg-boss v10 delivers batches; every job is handled idempotently.
      for (const job of jobs) {
        await this.email.handleJob(job.data);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    // pg-boss stop is owned by the infra JobsService lifecycle.
  }
}
