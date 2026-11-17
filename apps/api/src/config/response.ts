import { z } from "../openapi";

export const configSchema = z
  .object({
    isCloud: z.boolean(),
    disableRegistration: z.boolean(),
    disablePasswordRegistration: z.boolean(),
    disableEmailOtpSignIn: z.boolean(),
    disableWorkspaceCreation: z.boolean(),
    isDemoMode: z.boolean(),
    hasSmtp: z.boolean(),
    hasImageUploads: z.boolean().openapi({
      description:
        "Whether S3-compatible storage is configured, so task images and board backgrounds can be uploaded.",
    }),
    hasGithubSignIn: z.boolean(),
    hasGoogleSignIn: z.boolean(),
    hasDiscordSignIn: z.boolean(),
    hasCustomOAuth: z.boolean(),
    hasGuestAccess: z.boolean(),
    disableLoginForm: z.boolean(),
    customOAuthName: z.string().nullable().openapi({
      description:
        "Label for the custom OAuth provider on the sign-in page. Null means the generic SSO label.",
    }),
    customOAuthAutoLogin: z.boolean(),
    customOAuthLogoutUrl: z.string().nullable(),
    billingEnabled: z.boolean(),
    hasAssistant: z.boolean().openapi({
      description:
        "Whether the workspace assistant is available on this instance. False when DISABLE_ASSISTANT is true. Each workspace still needs an admin to save an OpenRouter key before members can chat.",
    }),
  })
  .openapi("Config");
