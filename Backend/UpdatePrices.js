require("dotenv").config();
const { google } = require("googleapis");
const { scrapePriceWithRetry, RequestQueue } = require("./AsinGooglesheet");

const PRE_URL = "https://amazon.com/dp/";
const SHEET_ID = process.env.TESTING_SHEET_ID;
const SHEET_NAME = "Sheet1";

const auth = new google.auth.GoogleAuth({
  keyFile: "MyTestCredentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

function getCol(index) {
  let col = "";
  while (index >= 0) {
    col = String.fromCharCode((index % 26) + 65) + col;
    index = Math.floor(index / 26) - 1;
  }
  return col;
}

async function compareAndUpdatePrices() {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  console.log("📥 Fetching sheet data...");
  const readRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}`,
  });

  const rows = readRes.data.values || [];
  if (rows.length === 0) {
    console.log("❌ No rows found.");
    return;
  }

  const [headers, ...dataRows] = rows;

  const asinIndex = headers.indexOf("ASIN Amazon");
  const originalPriceIndex = headers.indexOf("Original_Prices");
  const updatePriceIndex = headers.indexOf("Update_Prices");
  const qtyStatusIndex = headers.indexOf("qty_status");
  const stockIndex = headers.indexOf("Stock");
  const sellerIndex = headers.indexOf("Selllers");

  if (
    asinIndex === -1 || originalPriceIndex === -1 ||
    updatePriceIndex === -1 || qtyStatusIndex === -1 ||
    stockIndex === -1 || sellerIndex === -1
  ) {
    console.error("❌ One or more required columns are missing.");
    return;
  }

  const queue = new RequestQueue(process.env.MAX_CONCURRENT || 5);

  for (let batchStart = 0; batchStart < dataRows.length; batchStart += 10) {
    const batch = dataRows.slice(batchStart, batchStart + 10);
    const startRow = batchStart + 2;
    const endRow = startRow + batch.length - 1;

    console.log(`🚀 Processing batch rows ${startRow} to ${endRow}`);

    const results = await Promise.all(
      batch.map((row) =>
        queue.add(async () => {
          const asin = row[asinIndex];
          const oldPrice = row[originalPriceIndex] || "0";
          const oldStock = row[stockIndex] || "";
          const oldSeller = row[sellerIndex] || "";
          const url = PRE_URL + asin + "/ref=olp-opf-redir?aod=1";

          const { price: fetchedPrice, stock, seller } = await scrapePriceWithRetry(url);

          // ----- Normalize stock -----
          let newStock= stock;
          let newSeller = seller;

          // if (!stock || stock === "") {
          //   newStock = "Out of Stock";
          // } else if (stock.includes("In Stock")) {
          //   newStock = "In Stock";
          // } else if (stock.match(/\d+\s*in stock/i)) {
          //   const match = stock.match(/(\d+)\s*in stock/i);
          //   newStock = match ? `${match[1]} In Stock` : "In Stock";
          // } else if (stock.includes("Out of Stock")) {
          //   newStock = "Out of Stock";
          // } else {
          //   newStock = "Out of Stock";
          // }
          
          if (!stock || stock.trim() === "") {
            newStock = "Out of Stock";
          } else {
            const normalized = stock.toLowerCase();
          
            if (normalized.includes("in stock") || normalized.includes("auf lager")) {
              newStock = "In Stock";
            } else if (
              // English "Only X left in stock" → "In Stock"
              (normalized.includes("only") && normalized.includes("left in stock")) ||
              // German "Nur noch X vorrätig" → "In Stock"
              (normalized.includes("nur noch") && normalized.includes("vorrätig"))
            ) {
              newStock = "In Stock";
            } else if (
              normalized.includes("available to ship") ||
              normalized.includes("lieferbar") ||
              normalized.includes("versandbereit")
            ) {
              newStock = "In Stock";
            } else if (
              // Handling "Gewöhnlich versandfertig in X Monaten" (Usually ships in X months)
              normalized.includes("gewöhnlich versandfertig in")||
              normalized.includes("usually ships within")
            ) {
              newStock = "In Stock (Shipping Delayed)";
            } else if (
              normalized.includes("out of stock") ||
              normalized.includes("nicht auf lager")
            ) {
              newStock = "Out of Stock";
            } else {
              newStock = "Out of Stock"; // fallback
            }
          }
          
  
  // ----- Handle missing seller + out of stock -----
  if (!seller && newStock === "Out of Stock") {
    console.log(`⚠️ Seller missing and product out of stock. Marking as unavailable.`);
    newStock = "Out of Stock";
    newSeller = "Seller Not Found";
  }else if (seller === 'SellerNotFound'){
    newSeller = "Seller Not Found";
  }

  let price = fetchedPrice || "";
  if (
    price === "0" || price === "Unavailable" || price === "Not Found" ||
    price === "Error" || price === "-1"
  ) {
    console.log(`✅ Error ASIN ${asin}`);
    return [0, 0, 1, newStock, newSeller]; // mark qty_status as 1
  }
  
          price = price.replace("$", "").trim();
          const isPriceChanged = price !== oldPrice;

          if (isPriceChanged) {
            console.log(`✅ Price changed for ASIN ${asin}: Old = ${oldPrice}, New = ${price}`);
            return [Number(price), 1, 0, newStock, newSeller];
          } else {
            console.log(`🟡 Price unchanged for ASIN ${asin}: ${oldPrice}`);
            return [Number(oldPrice), 0, 0, newStock, newSeller];
          }
        })
      )
    );

    const priceCol = getCol(originalPriceIndex);
    const updateCol = getCol(updatePriceIndex);
    const qtyCol = getCol(qtyStatusIndex);
    const stockCol = getCol(stockIndex);
    const sellerCol = getCol(sellerIndex);
    const range = `${SHEET_NAME}!${priceCol}${startRow}:${sellerCol}${endRow}`;

    const updatedValues = results.map((row, i) => ({
      row: startRow + i,
      price: row[0] ?? "",
      update_price: row[1] ?? 0,
      qty_status: row[2] ?? 0,
      stock: row[3] ?? "",
      seller: row[4] ?? "",
    }));

    // 🔍 Print table for debugging before updating sheet
    console.table(updatedValues);

    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range,
        valueInputOption: "RAW",
        requestBody: {
          values: updatedValues.map(r => [r.price, r.update_price, r.qty_status, r.stock, r.seller]),
        },
      });

      console.log(`✅ Sheet updated successfully for rows ${startRow} to ${endRow}`);
    } catch (err) {
      console.error(`❌ Failed to update sheet rows ${startRow}-${endRow}: ${err.message}`);
    }
  }

  console.log("🎯 Price comparison complete.");
}

compareAndUpdatePrices().catch(console.error);
