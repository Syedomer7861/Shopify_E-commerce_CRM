import { google } from "googleapis";
import { createServerClient } from "./supabase";
import { getSystemSettings } from "./server-settings";

export async function getGmailClient() {
  const supabase = createServerClient();
  // settings RLS is admin-only now (it holds API secrets); this is called
  // from automated flows (order-confirmation emails, workflow-engine) that
  // don't always run under an admin session, so it needs the service-role
  // fallback rather than a raw .select() under the caller's own session.
  const settings = await getSystemSettings(supabase);

  if (!settings) {
    throw new Error("Failed to fetch settings from database.");
  }

  if (!settings.gmail_client_id || !settings.gmail_client_secret) {
    throw new Error("Gmail OAuth credentials not configured.");
  }

  const oauth2Client = new google.auth.OAuth2(
    settings.gmail_client_id,
    settings.gmail_client_secret,
    settings.gmail_redirect_uris?.[0] || "http://localhost:3000/api/auth/google/callback"
  );

  if (settings.gmail_refresh_token) {
    oauth2Client.setCredentials({
      refresh_token: settings.gmail_refresh_token
    });
  }

  return oauth2Client;
}

export async function sendGmail({
  to,
  subject,
  body,
  attachments = []
}: {
  to: string;
  subject: string;
  body: string;
  attachments?: { filename: string; content: string; contentType: string }[];
}) {
  const auth = await getGmailClient();
  const gmail = google.gmail({ version: "v1", auth });

  // An HTML-only message (no text/plain alternative) is a real spam-score
  // factor - most filters treat "html with no plain fallback" as a signal.
  // Structure: multipart/mixed (attachments) wrapping multipart/alternative
  // (plain + html), which is the conventional nesting mail clients expect;
  // multipart/alternative alone when there's nothing to attach.
  const mixedBoundary = "__CUREFOREVER_MIXED__";
  const altBoundary = "__CUREFOREVER_ALT__";
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const plainText = body; // caller passes the raw, unescaped message text
  const htmlBody = body.replace(/\n/g, '<br/>');

  const alternativePart = [
    `--${altBoundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    'Content-Transfer-Encoding: 7bit',
    '',
    plainText,
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    'Content-Transfer-Encoding: 7bit',
    '',
    `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <!-- Deliberately light-only, not "light dark": the logo is a
           transparent-background PNG (icon + wordmark), and Gmail's mobile
           apps apply their own automatic dark-mode recoloring to table/cell
           backgrounds that's inconsistent enough to leave parts of a
           transparent logo unreadable even with explicit white backgrounds
           set on every wrapping element. Declaring light-only tells clients
           not to auto-darken this email at all, which is the standard fix
           for exactly this failure mode - the template is white/cream by
           design anyway, so there's no dark variant worth maintaining. -->
      <meta name="color-scheme" content="light">
      <meta name="supported-color-schemes" content="light">
      <style>
        :root {
          color-scheme: light;
          supported-color-schemes: light;
        }
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
          background-color: #f7f4ed; 
          margin: 0; 
          padding: 40px 10px; 
          color: #1c1c1c;
          -webkit-font-smoothing: antialiased;
        }
        .container { 
          max-width: 600px; 
          margin: 0 auto; 
          background-color: #ffffff; 
          border-radius: 24px; 
          overflow: hidden; 
          box-shadow: 0 20px 60px rgba(28, 28, 28, 0.08);
          border: 1px solid #eceae4;
        }
        .header-td { 
          background-color: #ffffff !important; 
          padding: 50px 20px; 
          text-align: center; 
          border-bottom: 1px solid #f7f4ed;
        }
        .logo-img {
          max-width: 220px;
          height: auto;
          display: block;
          margin: 0 auto;
        }
        .content { 
          padding: 60px 50px; 
          line-height: 1.8; 
          font-size: 16px; 
          color: #1c1c1c;
        }
        .footer { 
          background-color: #fcfbf8; 
          padding: 40px; 
          text-align: center; 
          border-top: 1px solid #eceae4; 
          font-size: 11px; 
          color: #5f5f5d;
          text-transform: uppercase;
          letter-spacing: 0.15em;
        }
        .signature { 
          margin-top: 50px; 
          padding-top: 40px; 
          border-top: 1px solid #f3f3f1; 
        }
        .status-badge {
          display: inline-block;
          padding: 6px 12px;
          background-color: #1c1c1c;
          color: #ffffff;
          font-size: 10px;
          font-weight: 900;
          border-radius: 6px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 24px;
        }
        .divider {
          height: 1px;
          background: linear-gradient(to right, transparent, #eceae4, transparent);
          margin: 40px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- The light-only color-scheme meta above is the real fix (stops
             clients from auto-darkening this email at all - the transparent
             PNG logo was going invisible against Gmail's auto-dark
             background). This nested white table is a second safety net for
             any client that ignores that meta tag anyway. -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td align="center" bgcolor="#ffffff" class="header-td" style="background-color: #ffffff; padding: 50px 20px; border-bottom: 1px solid #f7f4ed;">
              <table border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 16px;">
                <tr>
                  <td bgcolor="#ffffff" align="center" style="background-color: #ffffff; padding: 16px 24px; border-radius: 16px;">
                    <img src="https://cureforever.in/cdn/shop/files/Cureforever_TM_Logo_1.png?v=1751527749&width=600" width="220" alt="CureForever" class="logo-img" style="display: block; border: 0; background-color: #ffffff;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <div class="content">
          <div class="status-badge">Official Communication</div>
          <div style="margin-bottom: 30px;">
            ${htmlBody}
          </div>
          
          <div class="signature">
            <p style="margin: 0; font-size: 15px; color: #5f5f5d;">Best regards,</p>
            <p style="margin: 8px 0 0; font-weight: 900; font-size: 20px; letter-spacing: -0.02em; color: #1c1c1c;">Team CureForever</p>
            <p style="margin: 4px 0 0; font-size: 10px; color: #5f5f5d; text-transform: uppercase; letter-spacing: 0.2em; font-weight: bold;">Customer Success Operations</p>
          </div>
        </div>
        <div class="footer">
          &copy; 2026 CureForever. All rights reserved.<br>
          <div style="margin-top: 15px; font-size: 9px; opacity: 0.6; text-transform: none; letter-spacing: normal;">
            Cureforever, a health and wellness supplement brand.
          </div>
        </div>
      </div>
    </body>
    </html>`,
    '',
    `--${altBoundary}--`,
  ].join('\r\n');

  let message: string;
  if (attachments.length === 0) {
    message = [
      `To: ${to}`,
      `Subject: ${utf8Subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      alternativePart,
    ].join('\r\n');
  } else {
    let mixed = [
      `To: ${to}`,
      `Subject: ${utf8Subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
      '',
      `--${mixedBoundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      alternativePart,
      '',
    ].join('\r\n');

    for (const attachment of attachments) {
      mixed += [
        `--${mixedBoundary}`,
        `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
        'MIME-Version: 1.0',
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        '',
        attachment.content,
        '',
      ].join('\r\n');
    }

    mixed += `--${mixedBoundary}--`;
    message = mixed;
  }

  // The body needs to be base64url encoded.
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
    },
  });

  return res.data;
}
