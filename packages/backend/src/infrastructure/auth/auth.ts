import { betterAuth } from "better-auth";
import { username, anonymous, admin } from "better-auth/plugins";
import { Pool } from "pg";
import { Resend } from "resend";
import { env } from "../../config/env.js";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

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
      minPasswordLength: 8, // OWASP recommended minimum
      sendResetPassword: async ({ user, url }) => {
        if (resend) {
          await resend.emails.send({
            from: `The Box <${env.EMAIL_FROM}>`,
            to: user.email,
            subject: "Réinitialiser votre mot de passe",
            html: `
            <h1>Réinitialisation du mot de passe</h1>
            <p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe :</p>
            <a href="${url}">Réinitialiser mon mot de passe</a>
            <p>Ce lien expirera dans 1 heure.</p>
            <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
          `,
          });
        } else {
          console.log(`[DEV] Password reset for ${user.email}: ${url}`);
        }
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        if (resend) {
          await resend.emails.send({
            from: `The Box <${env.EMAIL_FROM}>`,
            to: user.email,
            subject: "Vérifiez votre adresse email",
            html: `
            <h1>Bienvenue sur The Box !</h1>
            <p>Cliquez sur le lien ci-dessous pour vérifier votre adresse email :</p>
            <a href="${url}">Vérifier mon email</a>
            <p>Ce lien expirera dans 24 heures.</p>
          `,
          });
        } else {
          console.log(`[DEV] Email verification for ${user.email}: ${url}`);
        }
      },
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 50,
      }),
      anonymous({
        emailDomainName: "guest.thebox.local",
      }),
      admin({
        defaultRole: "user",
      }),
    ],
    user: {
      additionalFields: {
        displayName: {
          type: "string",
          required: false,
        },
        avatarUrl: {
          type: "string",
          required: false,
        },
        totalScore: {
          type: "number",
          defaultValue: 0,
        },
        currentStreak: {
          type: "number",
          defaultValue: 0,
        },
        longestStreak: {
          type: "number",
          defaultValue: 0,
        },
        lastPlayedAt: {
          type: "date",
          required: false,
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
    },
    trustedOrigins: [env.CORS_ORIGIN],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            // First user to register becomes admin
            const result = await pool.query('SELECT COUNT(*) as count FROM "user"');
            const userCount = parseInt(result.rows[0].count, 10);

            if (userCount === 0) {
              console.log("[AUTH] First user registration - assigning admin role");
              return {
                data: { ...user, role: "admin" },
              };
            }
            return { data: user };
          },
        },
      },
    },
  });
}

export const auth = createAuth();

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
