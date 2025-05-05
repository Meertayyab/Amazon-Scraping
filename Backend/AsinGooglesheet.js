const puppeteer = require('puppeteer'); // Use the full puppeteer package
const faker = require('faker'); // Import faker for randomization

// ------------------- Request Queue --------------------
class RequestQueue {
  constructor(maxConcurrent) {
    this.queue = [];
    this.running = 0;
    this.maxConcurrent = maxConcurrent;
  }

  async add(requestFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject });
      this.runNext();
    });
  }

  async runNext() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) return;
    const { requestFn, resolve, reject } = this.queue.shift();
    this.running++;
    try {
      const result = await requestFn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.runNext();
    }
  }
}

const proxies = [
  "http://mordeckrau50705:bxvduwa1wt@160.202.95.254:21293",
  "http://mordeckrau50705:bxvduwa1wt@179.61.252.37:21266",
  "http://mordeckrau50705:bxvduwa1wt@191.96.30.139:21240",
  "http://mordeckrau50705:bxvduwa1wt@179.61.252.243:21264",
  "http://mordeckrau50705:bxvduwa1wt@172.82.147.246:21240",
  "http://mordeckrau50705:bxvduwa1wt@204.217.176.101:21280",
  "http://mordeckrau50705:bxvduwa1wt@204.217.176.28:21234",
  "http://mordeckrau50705:bxvduwa1wt@104.143.253.105:21261",
  "http://mordeckrau50705:bxvduwa1wt@172.82.147.54:21296",
  "http://mordeckrau50705:bxvduwa1wt@104.143.253.203:21308",
];

function getRandomProxy() {
  return proxies[Math.floor(Math.random() * proxies.length)];
}

async function scrapePriceWithRetry(url, attempt = 1) {
  const useProxy = false; // Set to true if you want to use proxy for specific cases
  const proxy = useProxy ? getRandomProxy() : null; // Use proxy only if required
  const MAX_RETRIES = 10;

  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
  ];

  if (proxy) {
    launchArgs.push(`--proxy-server=${proxy}`); // Add proxy to the launch arguments if needed
  }

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
      args: launchArgs,
    });

    const page = await browser.newPage();

    // Randomize user agent, language, and other browser settings
    await page.setUserAgent(faker.internet.userAgent());
    await page.setViewport({
      width: faker.datatype.number({ min: 1024, max: 1920 }),
      height: faker.datatype.number({ min: 768, max: 1080 }),
    });

    // Set random headers to mimic real browser behavior
    await page.setExtraHTTPHeaders({
      'Accept-Language': faker.random.arrayElement(['en-US', 'en-GB', 'fr-FR', 'de-DE']),
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
    });

    // Wait for the DOM to load before trying to extract any elements
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });


let rawPriceText;

try {
  console.log('Trying new primary XPath (//*[@id="aod-price-0"]/div/span[1])...');
  rawPriceText = await page.$eval(
    '::-p-xpath(//*[@id="aod-price-0"]/div/span[1])',
    el => el?.textContent.trim()
  );
  if (!rawPriceText) throw new Error('Empty price in new primary XPath');
  console.log('✅ New primary price found:', rawPriceText);
} catch {
  try {
    console.log('Primary failed. Trying original main XPath (div[1]/span[1])...');
    rawPriceText = await page.$eval(
      '::-p-xpath(//*[@id="aod-price-0"]/div[1]/span[1])',
      el => el?.textContent.trim()
    );
    if (!rawPriceText) throw new Error('Empty price in original main XPath');
    console.log('✅ Original main XPath price found:', rawPriceText);
  } catch {
    try {
      console.log('Trying fallback XPath (//*[@id="aod-price-1"]/div/span[1])...');
      rawPriceText = await page.$eval(
        '::-p-xpath(//*[@id="aod-price-1"]/div/span[1])',
        el => el?.textContent.trim()
      );
      if (!rawPriceText) throw new Error('Empty price in aod-price-1 fallback XPath');
      console.log('✅ Fallback XPath (div/span[1]) price found:', rawPriceText);
    } catch {
      try {
        console.log('Fallback failed. Trying (//*[@id="aod-price-1"]/div[1]/span[1])...');
        rawPriceText = await page.$eval(
          '::-p-xpath(//*[@id="aod-price-1"]/div[1]/span[1])',
          el => el?.textContent.trim()
        );
        if (!rawPriceText) throw new Error('Empty price in fallback 1');
        console.log('✅ Fallback XPath 1 price found:', rawPriceText);
      } catch {
        try {
          console.log('Trying to combine whole and fraction (Fallback 2)...');
          const whole = await page.$eval(
            '::-p-xpath(//*[@id="aod-price-0"]/div[1]/span[3]/span[2]/span[2])',
            el => el?.textContent.trim()
          );
          const fraction = await page.$eval(
            '::-p-xpath(//*[@id="aod-price-0"]/div[1]/span[3]/span[2]/span[3])',
            el => el?.textContent.trim()
          );
          if (!whole || !fraction) throw new Error('Missing part of price');
          rawPriceText = `${whole}.${fraction}`;
          console.log('✅ Fallback 2 combined price:', rawPriceText);
        } catch {
          try {
            console.log('Trying fallback 3 (corePrice_feature_div)...');
            rawPriceText = await page.$eval(
              '#corePrice_feature_div .a-price .a-offscreen',
              el => el?.textContent.trim()
            );
            if (!rawPriceText) throw new Error('Empty price in fallback 3');
            console.log('✅ Fallback 3 price found:', rawPriceText);
          } catch {
            try {
              console.log('Trying fallback 4 (alternate corePrice_feature_div)...');
              rawPriceText = await page.$eval(
                '#corePrice_feature_div > div > div > span.a-price.aok-align-center > span.a-offscreen',
                el => el?.textContent.trim()
              );
              if (!rawPriceText) throw new Error('Empty price in fallback 4');
              console.log('✅ Fallback 4 price found:', rawPriceText);
            } catch {
              try {
                console.log('Trying fallback 5 (corePriceDisplay_desktop_feature_div)...');
                rawPriceText = await page.$eval(
                  '::-p-xpath(//*[@id="corePriceDisplay_desktop_feature_div"]/div[1]/span[1])',
                  el => el?.textContent.trim()
                );
                if (!rawPriceText) throw new Error('Empty price in fallback 5');
                console.log('✅ Fallback 5 price found:', rawPriceText);
              } catch {
                console.log('❌ All price extraction attempts failed.');
                rawPriceText = undefined;
              }
            }
          }
        }
      }
    }
  }
}


// Optional: Remove duplicate prices like "$7.99$7.99"
function removeDuplicatePrices(text) {
  return text.replace(/(\$\d+(\.\d{2})?)\1+/, '$1');
}


function cleanPrice(priceText) {
  // Remove non-numeric except . and ,
  let normalized = priceText.replace(/[^0-9.,]/g, '').replace(',', '.');

  // Fix multiple dots like "29..99" → "29.99"
  normalized = normalized.replace(/\.\.+/g, '.');

  // If there are still multiple dots, keep only the first one
  const firstDotIndex = normalized.indexOf('.');
  if (firstDotIndex !== -1) {
    const beforeDot = normalized.slice(0, firstDotIndex + 1);
    const afterDot = normalized.slice(firstDotIndex + 1).replace(/\./g, '');
    normalized = beforeDot + afterDot;
  }

  // Match a valid price pattern (1–3 digits before dot, 1–2 digits after)
  const match = normalized.match(/(\d{1,3}(?:\.\d{1,2})?)/);

  if (match && match[1]) {
    console.log('Matched cleaned price:', match[1]);
    return match[1];
  }

  console.warn('Price pattern not matched in cleaned text:', normalized);
  return null;
}


let finalPrice = null;

if (rawPriceText) {
  console.log('Raw Extracted Price Text:', rawPriceText);

  // Remove duplicate prices if present
  rawPriceText = removeDuplicatePrices(rawPriceText);

  // Clean and extract price
  const cleanedPrice = cleanPrice(rawPriceText);

  if (cleanedPrice) {
    const parsed = parseFloat(cleanedPrice);
    if (!isNaN(parsed)) {
      finalPrice = parsed.toFixed(2);
      console.log('✅ Final Cleaned Price:', finalPrice);
    } else {
      console.warn('Parsed price is NaN:', cleanedPrice);
    }
  } else {
    console.warn('Failed to clean price:', rawPriceText);
  }
}


    let seller;

try {
  console.log('Trying primary XPath for seller...');
  seller = await page.$eval(
    '::-p-xpath(//*[@id="aod-offer-shipsFrom"]/div/div/div[2]/span)',
    el => el?.textContent.trim()
  );
  if (!seller) throw new Error('Empty seller text in primary');
  console.log('Primary seller found:', seller);
} catch {
  try {
    console.log('Primary failed. Trying fallback 2 (CSS selector)...');
    seller = await page.$eval(
      '#aod-offer-shipsFrom span.a-fixed-left-grid-col.a-col-right span',
      el => el?.textContent.trim()
    );
    if (!seller) throw new Error('Empty seller text in fallback 2');
    console.log('Fallback 2 seller found:', seller);
  } catch {
    try {
      console.log('Fallback 2 failed. Trying fallback 3 (fulfillerInfoFeature)...');
      seller = await page.$eval(
        '::-p-xpath(//*[@id="fulfillerInfoFeature_feature_div"]/div[2]/div[1]/span)',
        el => el?.textContent.trim()
      );
      if (!seller) throw new Error('Empty seller text in fallback 3');
      console.log('Fallback 3 seller found:', seller);
    } catch {
      console.log('All seller extraction attempts failed.');
      seller = null;
    }
  }
}


    // Fetch stock status
    const stock = await page.$eval(
      '::-p-xpath(//*[@id="availability"]/span)',
      (element) => element ? element.textContent.trim() : null
    ).catch(() => null);

    console.log(`✅ Price: ${finalPrice}, Stock: ${stock}, Seller: ${seller}`);

    return { price: finalPrice || "Not Found", stock: stock || "Unknown", seller: seller || "Seller Not Found", proxy };

  } catch (err) {
    console.warn(`⚠️ Attempt ${attempt} failed for ${url} using ${proxy}: ${err.message}`);
    if (attempt < MAX_RETRIES) {
      return await scrapePriceWithRetry(url, attempt + 1);
    }
    return { price: "Error", stock: "Error", seller: "Error", proxy };
  } finally {
    if (browser) await browser.close();
  }
}





// ----------------- Scrape Function ---------------------
// async function scrapePriceWithRetry(url, attempt = 1) {
//     const { proxy, agent } = getRandomProxy();

//     try {
//         const { data } = await axios.get(url, {
//             httpsAgent: agent,
//             proxy: false,
//             headers: {
//                 "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
//             },
//             timeout: 15000,
//         });

//         const $ = cheerio.load(data);

//         // ---- Check for Unavailable Products ----
//         const unavailableText = $('#outOfStock > div > div.a-section.a-spacing-small.a-text-center > span.a-color-price.a-text-bold').text().trim();

//         if (unavailableText && unavailableText.toLowerCase().includes('currently unavailable')) {
//             console.log(`⚠️ Product is unavailable (outOfStock detected): ${unavailableText}`);
//             return { price: "Unavailable", stock: "OutOfStock", seller: "Seller Not Found", proxy };
//         }

//         // ---- Normal scraping continues here ----

//         // Find the 'Ships from' span
//         // const shipFromText = $('#fulfillerInfoFeature_feature_div span.offer-display-feature-text-message')
//         //     .first()
//         //     .text()
//         //     .trim() ||
//         //     $('#aod-offer-shipsFrom > div > div > div.a-fixed-left-grid-col.a-col-right > span')
//         //     .first()
//         //     .text()
//         //     .trim();

//         let shipFromText;
//         if($('#fulfillerInfoFeature_feature_div span.offer-display-feature-text-message').first().text().trim()){
//           shipFromText = $('#fulfillerInfoFeature_feature_div span.offer-display-feature-text-message').first().text().trim();
//         }else if ($(".a-fixed-left-grid-col.a-col-right > span > .a-size-small .a-color-base").first().text().trim()){
//           shipFromText = $(".a-fixed-left-grid-col.a-col-right > span").first().text().trim()
//         }else{
//           shipFromText = $('#aod-offer-shipsFrom > div > div > div.a-fixed-left-grid-col.a-col-right > span')
//         }

//         // Get Sold By Information
//         const soldByText = $(".a-spacing-none .a-size-small.a-color-base").first().text().trim();

//         // Identify Seller
//         let seller = "";
//         if (shipFromText) {
//             seller = `Shipped by ${shipFromText}`;
//         } else if (soldByText && soldByText.length > 0) {
//             seller = soldByText;
//         } else {
//             seller = ""; // IMPORTANT: Keep seller empty if not found
//         }

//         // Clean Stock
//         let stock = $("#availability").text().trim();
//         if (!stock) {
//             stock = "Out of Stock";
//         } else if (stock.includes("Usually ships") || stock.includes("available to ship")) {
//             stock = ""; // Ignore
//         } else if (stock.includes("In Stock")) {
//             stock = "In stock";
//         } else if (stock.match(/\d+\s*in stock/i)) {
//             const match = stock.match(/(\d+)\s*in stock/i);
//             stock = match ? `${match[1]} in stock` : "In stock";
//         } else if (stock.includes("Out of Stock")) {
//             stock = "Out of Stock";
//         } else {
//             stock = "Out of Stock";
//         }

//         // ---- Check if Seller is missing AND stock is Out of Stock ----
//         // if (!seller && stock === "Out of Stock") {
//         //     console.log(`⚠️ Seller missing and product out of stock. Marking as unavailable.`);
//         //     return { price: "Unavailable", stock: "OutOfStock", seller: "SellerNotFound", proxy };
//         // }

//         // ---- Only scrape price if seller exists or stock is available ----
//         // $("#priceblock_ourprice").first().text().trim() ||
//         // $("#priceblock_dealprice").first().text().trim() ||
//         // $(".a-price .a-offscreen").first().text().trim() ||
//         // $("#aod-price-0 .a-price .a-offscreen").first().text().trim() ||
//         // $("#corePrice_feature_div .a-price .a-offscreen").first().text().trim() ||
//         // $("#tp_price_block_total_price_ww .a-price .a-offscreen").first().text().trim() ||
//         // $("#corePriceDisplay_desktop_feature_div > div.a-section.a-spacing-none.aok-align-center.aok-relative > span.a-price.aok-align-center.reinventPricePriceToPayMargin.priceToPay")
//         //     .first()
//         //     .text()
//         //     .trim(); // ✅ your new selector
        
//         // let price = $(".a-price .a-offscreen").first().text().trim() ;
//         // let price = $("#corePrice_feature_div .a-price .a-offscreen").first().text().trim() ;
//         let price = 0;
//         if($(".a-price .a-offscreen").first().text().trim()){
//           price = $(".a-price .a-offscreen").first().text().trim();
//           console.log('first selector');
//         }else if($("#aod-price-0 > div > span.aok-offscreen")){
//           price = $("#aod-price-0 > div > span.aok-offscreen")
//           console.log('second selector')
//         }else if($("#aod-price-0 > div.a-section.a-spacing-none.aok-align-center.aok-relative > span.a-price.aok-align-center.centralizedApexPricePriceToPayMargin > span:nth-child(2) > span.a-price-whole")){
//          price = $("#aod-price-0 > div.a-section.a-spacing-none.aok-align-center.aok-relative > span.a-price.aok-align-center.centralizedApexPricePriceToPayMargin > span:nth-child(2) > span.a-price-whole")
//          console.log('price 3rd selector',price);
//         }
//         else{
//           price = $("#corePrice_feature_div .a-price .a-offscreen").first().text().trim();
//           console.log('fourth selector');
//         }

//         // ||
//         // $("#priceblock_ourprice").first().text().trim() ||
//         // $("#priceblock_dealprice").first().text().trim() ||
//         // $(".a-price .a-offscreen").first().text().trim() ||
//         // $("#corePrice_feature_div .a-price .a-offscreen").first().text().trim() ||
//         // $("#tp_price_block_total_price_ww .a-price .a-offscreen").first().text().trim();

//     if (price) {
//         price = price.replace(/[$,]/g, "").trim();
//         console.log(`✅ Found price: $${price}`);
//     } else {
//         price = "Not Found";
//         console.log(`❌ Price not found`);
//     }
//         console.log("empty ",price)
//        if(price ){
      
//         console.log("price are found aod price 0",price)
//        }
//        else{
//         console.log("not found with aod price 0")
//        }
      
    
//       if (price) {
//         price = price.replace(/[$,]/g, "").trim(); // Remove $ and commas
//       }
//       if (!price) price = 'Not Found';
      
//         console.log(`✅ Price: ${price}, Seller: ${seller || "N/A"}, Stock: ${stock}`);
        
//         return { price, stock, seller, proxy };

//     } catch (err) {
//         console.warn(`⚠️ Attempt ${attempt} failed for ${url} using ${proxy}: ${err.message}`);
//         if (attempt < MAX_RETRIES) {
//             console.log(`Retrying ${url}... Attempt ${attempt + 1}`);
//             return await scrapePriceWithRetry(url, attempt + 1);
//         }
//         console.error(`❌ Failed after ${MAX_RETRIES} attempts for ${url}`);
//         return { price: "Error", stock: "Error", seller: "Error", proxy };
//     }
// }


// ----------------- Main Function -----------------------
// async function main() {
//   try {
//     const client = await auth.getClient();
//     const sheets = google.sheets({ version: "v4", auth: client });

//     const readRes = await sheets.spreadsheets.values.get({
//       spreadsheetId: SHEET_ID,
//       range: `${SHEET_NAME}!A1:Z`,
//     });

//     const rows = readRes.data.values || [];
//     if (rows.length < 2) {
//       console.log("❌ No data found in the sheet.");
//       return;
//     }

//     const [headers, ...dataRows] = rows;

//     const asinIndex = headers.indexOf("ASIN Amazon");
//     const originalPriceIndex = headers.indexOf("Original_Prices");
//     const updatePriceIndex = headers.indexOf("Update_Prices");
//     const qtyStatusIndex = headers.indexOf("qty_status");

//     if ([asinIndex, originalPriceIndex, updatePriceIndex, qtyStatusIndex].includes(-1)) {
//       console.log("❌ One or more required headers are missing in the sheet.");
//       return;
//     }

//     const queue = new RequestQueue(MAX_CONCURRENT);

//     for (let batchStart = 0; batchStart < dataRows.length; batchStart += 10) {
//       const batch = dataRows.slice(batchStart, batchStart + 10);

//       const results = await Promise.all(
//         batch.map(async (row) => {
//           const asin = row[asinIndex];
//           const url = PRE_URL + asin + "/ref=olp-opf-redir?aod=1";
//           try {
//             const { price, stock, seller, proxy } = await scrapePriceWithRetry(url);
//             console.log(`🧪 ASIN: ${asin} => Price: ${price}, Seller: ${seller}, Stock: ${stock}`);
//             return { asin, price, stock, seller };
//           } catch (err) {
//             console.error(`❌ Error scraping ASIN ${asin}:`, err.message);
//           }
//         })
//       );

//       const rowStart = batchStart + 2;
//       const rowEnd = rowStart + results.length - 1;

//       const getColumnLetter = (index) => String.fromCharCode("A".charCodeAt(0) + index);

//       const updateRequests = [
//         {
//           range: `${SHEET_NAME}!${getColumnLetter(originalPriceIndex)}${rowStart}:${getColumnLetter(originalPriceIndex)}${rowEnd}`,
//           values: results.map((r) => [r.price]),
//         },
//         {
//           range: `${SHEET_NAME}!${getColumnLetter(updatePriceIndex)}${rowStart}:${getColumnLetter(updatePriceIndex)}${rowEnd}`,
//           values: results.map((r) => [r.price ? 0 : 1]), // mark 1 if price not found
//         },
//         {
//           range: `${SHEET_NAME}!${getColumnLetter(qtyStatusIndex)}${rowStart}:${getColumnLetter(qtyStatusIndex)}${rowEnd}`,
//           values: results.map((r) => [r.stock ? 0 : 1]), // mark 1 if stock not found
//         },
//         {
//           range: `${SHEET_NAME}!F${rowStart}:F${rowEnd}`,
//           values: results.map((r) => [r.stock]),
//         },
//         {
//           range: `${SHEET_NAME}!G${rowStart}:G${rowEnd}`,
//           values: results.map((r) => [r.seller]),
//         },
//       ];

//       try {
//         await sheets.spreadsheets.values.batchUpdate({
//           spreadsheetId: SHEET_ID,
//           requestBody: {
//             valueInputOption: "RAW",
//             data: updateRequests,
//           },
//         });
//         console.log(`✅ Updated rows ${rowStart} to ${rowEnd}`);
//       } catch (err) {
//         console.error(`❌ Failed to update sheet rows ${rowStart}–${rowEnd}:`, err.message);
//       }
//     }

//     console.log("🎉 All ASINs processed and sheet updated successfully!");
//   } catch (err) {
//     console.error("❌ Fatal error in main:", err.message);
//   }
// }

module.exports = {scrapePriceWithRetry,RequestQueue};

// main().catch(console.error);
