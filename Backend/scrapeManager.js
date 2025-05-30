// Required modules
const { google } = require("googleapis");
const { scrapePriceWithRetry, RequestQueue } = require("./Asin");
const moment = require("moment");
const {SHEETS} = require("./configSheet");




//AUS ACCOUNT PRE_URL
//const PRE_URL = "https://amazon.com.au/dp/";







// Constants
const PRE_URL = "https://amazon.com/dp/";
const MAX_CONCURRENT = process.env.MAX_CONCURRENT;

// Converts column index to column letter (e.g., 0 -> A, 27 -> AB)
function getCol(index) {
  let col = "";
  while (index >= 0) {
    col = String.fromCharCode((index % 26) + 65) + col;
    index = Math.floor(index / 26) - 1;
  }
  return col;
}

// Normalizes raw stock text into "In Stock" or "Out of Stock"
function normalizeStock(stockText) {
  const stock = stockText?.trim().toLowerCase() || "";
  const stockIndicators = [
    "in stock", "only", "left in stock", "nur noch", "vorrätig",
    "available to ship", "lieferbar", "versandbereit",
    "gewöhnlich versandfertig in", "usually ships within"
  ];
  const outOfStockIndicators = ["out of stock", "nicht auf lager"];

  if (stockIndicators.some(s => stock.includes(s))) return "In Stock";
  if (outOfStockIndicators.some(s => stock.includes(s))) return "Out of Stock";
  return "Out of Stock";
}

// Calculates how far the delivery date is from today and returns readable status
function checkDeliveryStatus(deliveryTime) {
  if (!deliveryTime || deliveryTime.trim() === "" || deliveryTime === "Delivery Not Found") return 0;

  const today = moment().startOf("day");
  const currentYear = today.year();

  // Match date range (e.g., May 12 – May 15)
  const rangeMatch = deliveryTime.match(/([A-Za-z]+\s\d{1,2})\s*(?:–|to)\s*([A-Za-z]+\s\d{1,2})/i);
  // Match single date (e.g., May 15)
  const singleMatch = deliveryTime.match(/^([A-Za-z]+\s\d{1,2})$/i);

  if (rangeMatch) {
    const end = moment(`${rangeMatch[2]} ${currentYear}`, "MMM D YYYY").startOf("day");
    if (end.isBefore(today)) end.add(1, "year");
    const diffDays = end.diff(today, "days");
    return `Delivery in ${diffDays} days`;
  }

  if (singleMatch) {
    const deliveryDate = moment(`${singleMatch[1]} ${currentYear}`, "MMM D YYYY").startOf("day");
    const diffDays = deliveryDate.diff(today, "days");
    if (diffDays > 0) return `Delivery in ${diffDays} ${diffDays === 1 ? "day" : "days"}`;
    if (diffDays === 0) return "Today is the delivery date";
    return "Delivery Date is in the Past";
  }

  return "Delivery Not Found";
}

async function compareAndUpdatePrices(sheetConfig) {
  console.log(`📄 Starting update for Sheet ID: ${sheetConfig.id}`);
  const auth = new google.auth.GoogleAuth({
    keyFile: sheetConfig.credentialFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  const readRes = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetConfig.id,
    range: sheetConfig.name,
  });

  const rows = readRes.data.values || [];
  if (rows.length === 0) {
    console.log("❌ No rows found.");
    return;
  }

  const [headers, ...dataRows] = rows;
  const indices = {
    asin: headers.indexOf("ASIN Amazon"),
    price: headers.indexOf("Original_Prices"),
    updateFlag: headers.indexOf("Update_Prices"),
    qtyStatus: headers.indexOf("qty_status"),
    stock: headers.indexOf("Stock"),
    seller: headers.indexOf("Selllers"),
    deliveryTime: headers.indexOf("delivery_time"),
    deliveryStatus: headers.indexOf("delivery_status"),
  };

  if (Object.values(indices).some(i => i === -1)) {
    console.error("❌ Required columns missing.");
    return;
  }

  const queue = new RequestQueue(MAX_CONCURRENT);

  for (let start = 0; start < dataRows.length; start += 10) {
    const batch = dataRows.slice(start, start + 10);
    const rowStart = start + 2;

    const results = await Promise.all(
      batch.map((row, i) =>
      queue.add(async () => {
        const asin = row[indices.asin];
        const oldPrice = row[indices.price] || "";
        const oldStock = row[indices.stock] || "";
        const oldSeller = row[indices.seller] || "";
        const oldDeliveryTime = row[indices.deliveryTime] || "";

        const url = `${PRE_URL}${asin}/ref=olp-opf-redir?aod=1`;
        const { price, stock, seller, deliveryTime } = await scrapePriceWithRetry(url);

        const newStock = normalizeStock(stock);
        const cleanPrice = price?.replace("$", "").trim() || "";
        const newSeller = seller || "Seller Not Found";
        const newDelivery = deliveryTime?.trim() || "";
        const deliveryStatus = checkDeliveryStatus(newDelivery);

        const invalidPrice = ["0", "Unavailable", "Not Found", "Error", "-1"];
        const isDeliveryMissing = !deliveryStatus || deliveryStatus === "Delivery Not Found";
        // const deliveryExceeded = !deliveryStatus || deliveryStatus.includes("Delivery in") && parseInt(deliveryStatus.match(/\d+/)?.[0] || "0") > 10;
        let deliveryExceeded = false;

if (!isDeliveryMissing) {
  const match = deliveryStatus.match(/\d+/);
  const deliveryDays = match ? parseInt(match[0], 10) : 0;
  if (deliveryDays > 10) {
    deliveryExceeded = true;
  }
} else {
  deliveryExceeded = true;
}


        if (invalidPrice.includes(cleanPrice)) {
          return { row: rowStart + i, values: [0, 0, 1, newStock, newSeller, newDelivery, deliveryStatus], changed: true };
        }

     

const isPriceChanged = Number(cleanPrice) !== Number(oldPrice);
const isStockChanged = String(newStock).trim() !== String(oldStock).trim();
const isSellerChanged = String(newSeller).trim().toLowerCase() !== String(oldSeller).trim().toLowerCase();
const isDeliveryChanged = String(newDelivery).trim().toLowerCase() !== String(oldDeliveryTime).trim().toLowerCase();



        if (!isPriceChanged && !isStockChanged && !isSellerChanged && !isDeliveryChanged && !deliveryExceeded) {
          return { row: rowStart + i, changed: false };
        }

const forceQtyStatus = newStock === 'Out of Stock' && deliveryStatus === 'Delivery Not Found';
const qtyStatus = deliveryExceeded || forceQtyStatus ? 1 : 0;

        return {
          row: rowStart + i,
          values: [
            Number(cleanPrice),
            isPriceChanged ? 1 : 0,
            qtyStatus,
            newStock,
            newSeller,
            newDelivery,
            deliveryStatus
          ],
          changed: true
        };
      })
    ));

    const updatedRows = results.filter(r => r.changed);
    if (updatedRows.length === 0) continue;

    const rangeCols = [
      getCol(indices.price),
      getCol(indices.updateFlag),
      getCol(indices.qtyStatus),
      getCol(indices.stock),
      getCol(indices.seller),
      getCol(indices.deliveryTime),
      getCol(indices.deliveryStatus),
    ];

    for (const { row, values } of updatedRows) {
      const range = `${sheetConfig.name}!${rangeCols[0]}${row}:${rangeCols[rangeCols.length - 1]}${row}`;
      try {
        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetConfig.id,
          range,
          valueInputOption: "RAW",
          requestBody: { values: [values] },
        });
        console.log(`✅ Row ${row} updated for ${sheetConfig.id}.`);
      } catch (err) {
        console.error(`❌ Error updating row ${row}: ${err.message}`);
      }
    }
  }

  console.log(`🎯 Finished sheet: ${sheetConfig.id}`);
}

let IsRunning = false;
let runningPromise = null;

function isRunning() {
  return IsRunning;
}

async function runAllSheets(sheets, maxConcurrent) {
  if (IsRunning) {
    throw new Error("Scraper is already running");
  }

  IsRunning = true;
  runningPromise = (async () => {
    try {
      const limit = (await import("p-limit")).default(maxConcurrent);
      const total = sheets.length;

      console.log(`🚀 Starting processing ${total} sheets with concurrency ${maxConcurrent}`);

      const tasks = sheets.map((sheet, index) =>
        limit(async () => {
          const sheetStart = Date.now();
          console.log(`▶️ Starting sheet ${sheet.id} (${index + 1}/${total})`);
          await compareAndUpdatePrices(sheet);
          console.log(`✅ Finished sheet ${sheet.id} in ${(Date.now() - sheetStart) / 1000}s`);
        })
      );

      await Promise.all(tasks);
    } catch (err) {
      console.error("❌ Error during sheet run:", err);
      throw err;
    } finally {
      IsRunning = false;
      runningPromise = null;
    }
  })();

  return runningPromise;
}

async function runSingleSheet(sheetId) {
  if (IsRunning) {
    throw new Error("Scraper is already running");
  }

  IsRunning = true;
  runningPromise = (async () => {
    try {
      const sheet = SHEETS.find((s) => s.id === sheetId);
      if (!sheet) throw new Error(`Sheet ${sheetId} not found`);
      await compareAndUpdatePrices(sheet);
    } catch (err) {
      console.error("❌ Error during single sheet run:", err);
      throw err;
    } finally {
      IsRunning = false;
      runningPromise = null;
    }
  })();

  return runningPromise;
}

module.exports = {
  isRunning,
  runAllSheets,
  runSingleSheet
};
