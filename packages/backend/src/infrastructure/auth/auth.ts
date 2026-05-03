import { betterAuth } from "better-auth";
import { username, anonymous, admin } from "better-auth/plugins";
import { Pool } from "pg";
import { Resend } from "resend";
import { env } from "../../config/env.js";
import { authLogger } from "../logger/logger.js";
import { inventoryRepository } from "../repositories/inventory.repository.js";
import { emailLogRepository } from "../repositories/email-log.repository.js";
import { renderEmailHtml, renderEmailText } from "../email/template.js";

const STARTER_INVENTORY: Array<{ itemType: string; itemKey: string; quantity: number }> = [
  { itemType: "powerup", itemKey: "hint_year", quantity: 2 },
  { itemType: "powerup", itemKey: "hint_publisher", quantity: 1 },
];

export const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

// Shared pool for database hooks
const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createAuth() {
  return betterAuth({
    baseURL: env.API_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: pool,
    emailAndPassword: {
      enabled: true,
      autoSignIn: true, // Explicitly enable automatic sign-in after registration
      minPasswordLength: 8, // OWASP recommended minimum
      sendResetPassword: async ({ user, url }) => {
        const subject = "Réinitialiser votre mot de passe";
        const html = renderEmailHtml({
          heading: "Réinitialisation du mot de passe",
          paragraphs: [
            "Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.",
            'Ce lien expirera dans <strong style="color:#f0abfc;">1 heure</strong>.',
          ],
          cta: { label: "Réinitialiser mon mot de passe", url },
          footerHtml:
            "Si vous n'avez pas demandé cette réinitialisation, ignorez cet e-mail — votre mot de passe ne sera pas modifié.",
        });
        const text = renderEmailText({
          heading: "Réinitialisation du mot de passe",
          paragraphs: [
            "Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe. Ce lien expirera dans 1 heure.",
          ],
          cta: { label: "Réinitialiser mon mot de passe", url },
          footerLines: [
            "Si vous n'avez pas demandé cette réinitialisation, ignorez cet e-mail.",
          ],
        });
        if (resend) {
          const { data, error } = await resend.emails.send({
            from: `The Box <${env.EMAIL_FROM}>`,
            to: user.email,
            subject,
            html,
            text,
          });
          if (error) {
            authLogger.error({ email: user.email, err: error.message }, "failed to send password reset email");
            await emailLogRepository.record({
              userId: user.id,
              recipient: user.email,
              type: "password-reset",
              subject,
              status: "failed",
              errorMessage: error.message,
            });
          } else {
            authLogger.info({ email: user.email, emailId: data?.id }, "password reset email sent");
            await emailLogRepository.record({
              userId: user.id,
              recipient: user.email,
              type: "password-reset",
              subject,
              status: "sent",
              providerMessageId: data?.id ?? null,
            });
          }
        } else {
          authLogger.info({ email: user.email, url }, "dev password reset link");
          await emailLogRepository.record({
            userId: user.id,
            recipient: user.email,
            type: "password-reset",
            subject,
            status: "skipped",
            errorMessage: "RESEND_API_KEY not configured",
          });
        }
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        const subject = "Vérifiez votre adresse email";
        const html = renderEmailHtml({
          heading: "Bienvenue sur The Box !",
          paragraphs: [
            "Confirme ton adresse e-mail pour activer ton compte et débloquer ton inventaire de départ.",
            'Ce lien expirera dans <strong style="color:#f0abfc;">24 heures</strong>.',
          ],
          cta: { label: "Vérifier mon email", url },
          footerHtml:
            "Si tu n'as pas créé de compte sur The Box, ignore cet e-mail.",
        });
        const text = renderEmailText({
          heading: "Bienvenue sur The Box !",
          paragraphs: [
            "Confirme ton adresse e-mail pour activer ton compte. Ce lien expirera dans 24 heures.",
          ],
          cta: { label: "Vérifier mon email", url },
          footerLines: [
            "Si tu n'as pas créé de compte sur The Box, ignore cet e-mail.",
          ],
        });
        if (resend) {
          const { data, error } = await resend.emails.send({
            from: `The Box <${env.EMAIL_FROM}>`,
            to: user.email,
            subject,
            html,
            text,
          });
          if (error) {
            authLogger.error({ email: user.email, err: error.message }, "failed to send verification email");
            await emailLogRepository.record({
              userId: user.id,
              recipient: user.email,
              type: "verification",
              subject,
              status: "failed",
              errorMessage: error.message,
            });
          } else {
            authLogger.info({ email: user.email, emailId: data?.id }, "verification email sent");
            await emailLogRepository.record({
              userId: user.id,
              recipient: user.email,
              type: "verification",
              subject,
              status: "sent",
              providerMessageId: data?.id ?? null,
            });
          }
        } else {
          authLogger.info({ email: user.email, url }, "dev email verification link");
          await emailLogRepository.record({
            userId: user.id,
            recipient: user.email,
            type: "verification",
            subject,
            status: "skipped",
            errorMessage: "RESEND_API_KEY not configured",
          });
        }
      },
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 50,
        schema: {
          user: {
            fields: {
              displayUsername: "display_username",
            },
          },
        },
      }),
      anonymous({
        emailDomainName: "guest.thebox.local",
      }),
      admin({
        defaultRole: "user",
        schema: {
          user: {
            fields: {
              banReason: "ban_reason",
              banExpires: "ban_expires",
            },
          },
        },
      }),
    ],
    user: {
      fields: {
        emailVerified: "emailVerified",
        createdAt: "createdAt",
        updatedAt: "updatedAt",
        isAnonymous: "isAnonymous",
      },
      additionalFields: {
        lastLoginAt: {
          type: "date",
          required: false,
          input: false,
        },
        totalScore: {
          type: "number",
          required: false,
          input: false,
          fieldName: "total_score",
        },
        currentStreak: {
          type: "number",
          required: false,
          input: false,
          fieldName: "current_streak",
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
    },
    trustedOrigins: [env.CORS_ORIGIN],
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            try {
              await pool.query(
                'UPDATE "user" SET "lastLoginAt" = NOW() WHERE id = $1',
                [session.userId]
              );
            } catch (error) {
              authLogger.error({ err: error, userId: session.userId }, "failed to update last_login_at");
            }
          },
        },
      },
      user: {
        create: {
          before: async (user) => {
            try {
              // First user to register becomes admin
              const result = await pool.query('SELECT COUNT(*) as count FROM "user"');
              const userCount = parseInt(result.rows[0].count, 10);

              if (userCount === 0) {
                authLogger.info("first user registration - assigning admin role");
                return {
                  data: { ...user, role: "admin" },
                };
              }
              return { data: user };
            } catch (error) {
              // Log the error but don't fail the registration
              // Better-auth will handle the user creation, we just won't assign admin role
              authLogger.error({ err: error }, "error in user creation hook");
              return { data: user };
            }
          },
          after: async (user) => {
            // Grant starter inventory to real registrations (skip anonymous guests)
            // so first-timers have hints available on their first session.
            if ((user as { isAnonymous?: boolean }).isAnonymous) {
              return;
            }
            try {
              await inventoryRepository.addMultipleItems(user.id, STARTER_INVENTORY);
              authLogger.info({ userId: user.id }, "granted starter inventory");
            } catch (error) {
              authLogger.error({ err: error }, "failed to grant starter inventory");
            }
          },
        },
      },
    },
  });
}

export const auth = createAuth();

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
