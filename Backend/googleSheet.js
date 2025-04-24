const { google } = require('googleapis');
const SHEET_ID = process.env.SPREADSHEET_ID;

const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

let sheetCleared = false; // flag to avoid clearing more than once

async function updateSheet(results, startingRow) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  // Clear sheet only once when starting fresh
  if (startingRow === 1 && !sheetCleared) {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A2:Z',
    });
    console.log('🧹 Sheet cleared from row 2 down');
    sheetCleared = true;
  }

  const rows = results.map(r => [
    new Date().toLocaleString(),
    r.url,
    r.ip,
    r.title || '',
    r.price || '',
    r.time,
    r.error || 'Success'
  ]);

  const range = `Sheet1!A${startingRow}`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: range,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: rows
    }
  });

  console.log(`📄 Google Sheet updated with ${rows.length} rows`);
}

module.exports = updateSheet;
