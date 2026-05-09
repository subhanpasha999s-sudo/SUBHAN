const EMAIL_SEND_FAILURE_PATTERNS = [
  "error sending magic link email",
  "error sending confirmation email",
  "error sending otp email",
] as const;

export function getOtpSendErrorMessage(message: string): string {
  const normalized = message.trim().toLowerCase();
  if (EMAIL_SEND_FAILURE_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "Could not send the email code. Check the Supabase SMTP settings for Brevo, including the SMTP host, port, login, API key, and verified sender.";
  }
  return message;
}
