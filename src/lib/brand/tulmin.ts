/** Default Tulmin support contact — override with `NEXT_PUBLIC_CONTACT_EMAIL` if needed. */
export const TULMIN_CONTACT_EMAIL = "info@tulmin.com";

export function getPublicContactEmail(): string {
  const fromEnv = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  return fromEnv || TULMIN_CONTACT_EMAIL;
}
