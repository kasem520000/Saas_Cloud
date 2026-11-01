import { Inject, Module, OnModuleInit } from "@nestjs/common";

import { InfrastructureModule } from "../../infra/infra.module";
import { JobsService, getBoss } from "../../infra/jobs/boss";
import { env } from "../../config/env";
import {
  EmailService,
  EMAIL_QUEUE,
  identitySenders,
  type EmailJobPayload,
} from "./application/email-service";

/** DI tokens (exported for consumer modules). */
export const EMAIL_SERVICE = Symbol("EMAIL_SERVICE");
export const IDENTITY_EMAIL_SENDERS = Symbol("IDENTITY_EMAIL_SENDERS");
export type { IdentityEmailSenders } from "./application/email-service";

/**
 * Notifications module skeleton (PHASE-003 §2.8): the email adapter only —
 * the in-app notification center arrives with PHASE-015. Registers the
 * email job handler on both the API and worker processes (WORKER_MODE
 * selects what listens for HTTP; jobs run in both).
 */
@Module({
  imports: [InfrastructureModule],
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
  ],
  exports: [EMAIL_SERVICE, IDENTITY_EMAIL_SENDERS],
})
export class NotificationsModule implements OnModuleInit {
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
}
