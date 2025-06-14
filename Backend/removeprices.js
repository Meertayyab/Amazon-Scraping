const { google } = require("googleapis");

async function clearPricesAndStock() {
  const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  const SHEET_ID = "1hIloaDiejbHcaOVEK2_Wk7LfEIk-8nJHbTLp5b8TmE4";
  const SHEET_NAME = "Sheet1";

  // Clearing both price (C column) and stock (D column)
  const ranges = [
    `${SHEET_NAME}!C2:C`, // Range for clearing price
    `${SHEET_NAME}!D2:D`, // Range for clearing stock
    `${SHEET_NAME}!E2:E`,
    `${SHEET_NAME}!F2:F`,
    `${SHEET_NAME}!G2:G`,
    `${SHEET_NAME}!H2:H`,
    `${SHEET_NAME}!I2:I`,
  ];

  try {
    await sheets.spreadsheets.values.batchClear({
      spreadsheetId: SHEET_ID,
      requestBody: {
        ranges: ranges,
      },
    });
    console.log("✔️ Prices and stock have been cleared.");
  } catch (error) {
    console.error("❌ Error clearing prices and stock: ", error);
  }
}

clearPricesAndStock().catch(console.error);
