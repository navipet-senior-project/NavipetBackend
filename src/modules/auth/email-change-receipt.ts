const receiptText =
  'Your NaviPet email address has been changed successfully. ' +
  'The next time you sign in, use your new email address.';

export async function sendEmailChangeReceipt(email: string, apiKey: string): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: 'NaviPet <noreply@navipet.me>',
      to: [email],
      subject: 'Your NaviPet email address was changed',
      text: receiptText,
      html:
        '<p>Your NaviPet email address has been changed successfully.</p>' +
        '<p>The next time you sign in, use your new email address.</p>',
    }),
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`Email-change receipt delivery failed with HTTP ${String(response.status)}`);
  }
}
