/**
 * DI tokens for the notifications module — kept in a leaf file so the
 * module file and the service file never import each other (cycle).
 */
export const EMAIL_SERVICE = Symbol("EMAIL_SERVICE");
export const IDENTITY_EMAIL_SENDERS = Symbol("IDENTITY_EMAIL_SENDERS");
export const NOTIFICATIONS_SERVICE = Symbol("NOTIFICATIONS_SERVICE");
