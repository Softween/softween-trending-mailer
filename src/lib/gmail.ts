/**
 * Gmail REST API email sender for Cloudflare Workers.
 * Uses a Google service account with domain-wide delegation.
 * Adapted from softween-live-detector.
 */

interface GmailEnv {
  GMAIL_CLIENT_EMAIL?: string;
  GMAIL_PRIVATE_KEY?: string;
  GMAIL_SENDER_EMAIL?: string;
}

interface GmailSendOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  headers?: Record<string, string>;
}

function base64url(input: string | ArrayBuffer): string {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function createSignedJwt(
  clientEmail: string,
  privateKey: string,
  senderEmail: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    sub: senderEmail,
    scope: 'https://www.googleapis.com/auth/gmail.send',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const unsignedToken = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const key = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsignedToken),
  );

  return `${unsignedToken}.${base64url(signature)}`;
}

async function getAccessToken(
  clientEmail: string,
  privateKey: string,
  senderEmail: string,
): Promise<string> {
  const jwt = await createSignedJwt(clientEmail, privateKey, senderEmail);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail OAuth token exchange failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Strip CR/LF (and surrounding control chars) from a header value to prevent injection. */
const sanitizeHeader = (v: string): string => v.replace(/[\r\n]+/g, ' ').trim();

/**
 * Guards against email header injection via the `to` field. Subscriber emails
 * are user-supplied, so this must be enforced here, not trusted from upstream.
 */
export function assertValidRecipient(to: string): void {
  if (/[\r\n]/.test(to) || !EMAIL_REGEX.test(to)) {
    throw new Error(`Invalid recipient email address: ${JSON.stringify(to)}`);
  }
}

function buildRawMessage(options: GmailSendOptions, senderEmail: string): string {
  assertValidRecipient(options.to);
  const from = sanitizeHeader(options.from ?? `GitHub Trending Digest <${senderEmail}>`);
  const boundary = `boundary_${Date.now()}`;
  const extraHeaders = Object.entries(options.headers ?? {}).map(
    ([k, v]) => `${sanitizeHeader(k)}: ${sanitizeHeader(v)}`,
  );
  const raw = [
    `From: ${from}`,
    `To: ${options.to}`,
    `Subject: =?UTF-8?B?${utf8ToBase64(options.subject)}?=`,
    ...extraHeaders,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    utf8ToBase64(options.html),
    `--${boundary}--`,
  ].join('\r\n');

  return base64url(raw);
}

export async function sendEmail(env: GmailEnv, options: GmailSendOptions): Promise<boolean> {
  assertValidRecipient(options.to);

  const clientEmail = env.GMAIL_CLIENT_EMAIL;
  const privateKey = env.GMAIL_PRIVATE_KEY;
  const senderEmail = env.GMAIL_SENDER_EMAIL;

  if (!clientEmail || !privateKey || !senderEmail) {
    throw new Error(
      'Gmail not configured: missing GMAIL_CLIENT_EMAIL, GMAIL_PRIVATE_KEY, or GMAIL_SENDER_EMAIL',
    );
  }

  const decodedKey = privateKey.replace(/\\n/g, '\n');
  const accessToken = await getAccessToken(clientEmail, decodedKey, senderEmail);
  const rawMessage = buildRawMessage(options, senderEmail);

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(senderEmail)}/messages/send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: rawMessage }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API send failed: ${res.status} ${body}`);
  }

  return true;
}
