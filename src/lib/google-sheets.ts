import { GoogleSpreadsheet } from 'google-spreadsheet';
import { OAuth2Client } from 'google-auth-library';
import { getDefaultOrgId } from './server-settings';
import { getOrgGoogle, openOrgSheet, sheetCell } from './google-org';

/**
 * The live sync sheet (GOOGLE_SHEET_ID) belongs to one organisation:
 * GOOGLE_SHEET_ORG_ID when set, else the seed org. Rows from any other org
 * are never written to it - customer names, phones and order payloads must
 * not leave their own tenant.
 */
async function isSheetOwner(orgId: string | null | undefined): Promise<boolean> {
  if (!orgId) return false;
  return orgId === (process.env.GOOGLE_SHEET_ORG_ID || (await getDefaultOrgId()));
}

/**
 * Initializes and returns a Google Spreadsheet instance using OAuth2.
 */
export async function getGoogleSheet() {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
  const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN || !SPREADSHEET_ID) {
    console.warn('Google Sheets configuration missing. Sync will be skipped.');
    return null;
  }

  try {
    const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET);
    oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, oauth2Client);
    await doc.loadInfo();
    return doc;
  } catch (error) {
    console.error('Failed to initialize Google Sheet:', error);
    return null;
  }
}

/**
 * Appends a row to a specific sheet (tab) by title.
 * Creates the sheet if it doesn't exist.
 */
export async function appendToSheet(orgId: string | null | undefined, sheetTitle: string, row: Record<string, any>) {
  try {
    // The org's own connected Google account first; else the platform sheet,
    // only for the org that owns it.
    const conn = orgId ? await getOrgGoogle(orgId) : null;
    const doc = conn ? await openOrgSheet(conn) : (await isSheetOwner(orgId)) ? await getGoogleSheet() : null;
    if (!doc) return;

    let sheet = doc.sheetsByTitle[sheetTitle];
    const headers = Object.keys(row);
    
    if (!sheet) {
      console.log(`Creating new sheet tab: ${sheetTitle}`);
      sheet = await doc.addSheet({ title: sheetTitle, headerValues: headers });
    } else {
      // Ensure existing sheet has all headers from the new row
      await sheet.loadHeaderRow();
      const existingHeaders = sheet.headerValues;
      const needsHeaderUpdate = headers.some(h => !existingHeaders.includes(h));
      
      if (needsHeaderUpdate) {
        console.log(`Updating headers for ${sheetTitle} to include new columns...`);
        const updatedHeaders = Array.from(new Set([...existingHeaders, ...headers]));
        await sheet.setHeaderRow(updatedHeaders);
      }
    }

    // Clean data for Google Sheets (convert nested objects to strings)
    // Objects as JSON; text that starts like a formula is kept as text.
    const cleanRow: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) cleanRow[key] = sheetCell(value);

    // raw: values are stored as typed, never evaluated as formulas.
    await sheet.addRow(cleanRow, { raw: true });
    console.log(`Successfully synced row to Google Sheet: ${sheetTitle}`);
  } catch (error) {
    console.error(`Error appending to Google Sheet (${sheetTitle}):`, error);
  }
}
