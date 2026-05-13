import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Readable } from 'stream';

/**
 * Initializes and returns a Google Drive instance using OAuth2.
 */
export function getGoogleDrive() {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.warn('Google Drive configuration missing.');
    return null;
  }

  const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * Uploads a file (CSV string) to Google Drive.
 */
export async function uploadToDrive(filename: string, content: string, folderName: string = 'CRM_Backups') {
  try {
    const drive = getGoogleDrive();
    if (!drive) return;

    // 1. Find or Create Folder
    let folderId = '';
    const res = await drive.files.list({
      q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
    });

    if (res.data.files && res.data.files.length > 0) {
      folderId = res.data.files[0].id!;
    } else {
      const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      };
      const folder = await drive.files.create({
        requestBody: folderMetadata,
        fields: 'id',
      });
      folderId = folder.data.id!;
      console.log(`Created new backup folder: ${folderName} (${folderId})`);
    }

    // 2. Upload File
    const fileMetadata = {
      name: filename,
      parents: [folderId],
    };
    
    const media = {
      mimeType: 'text/csv',
      body: Readable.from([content]),
    };

    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id',
    });

    console.log(`Successfully backed up to Drive: ${filename} (ID: ${file.data.id})`);
    return file.data.id;
  } catch (error) {
    console.error(`Error uploading to Google Drive (${filename}):`, error);
  }
}
