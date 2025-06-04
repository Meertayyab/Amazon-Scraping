const puppeteer = require("puppeteer"); // Use the full puppeteer package
const faker = require("faker"); // Import faker for randomization



// ------------------- Request Queue --------------------
// Handles concurrent requests with a limit
class RequestQueue {
  constructor(maxConcurrent) {
    this.queue = [];
    this.running = 0;
    this.maxConcurrent = maxConcurrent;
  }


    // Add a new function to the queue and resolve when it completes
  async add(requestFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject });
      this.runNext();
    });
  }

    // Run the next function in the queue if concurrency allows
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

// ---------------- Proxy Configuration ----------------
// Rotating list of proxies for optional use

const proxies = [
  {
    ip: "160.202.95.254",
    port: "21293",
    username: "mordeckrau50705",
    password: "bxvduwa1wt",
  },
  {
    ip: "179.61.252.37",
    port: "21266",
    username: "mordeckrau50705",
    password: "bxvduwa1wt",
  },
  {
    ip: "191.96.30.139",
    port: "21240",
    username: "mordeckrau50705",
    password: "bxvduwa1wt",
  },
  {
    ip: "179.61.252.243",
    port: "21264",
    username: "mordeckrau50705",
    password: "bxvduwa1wt",
  },
  {
    ip: "172.82.147.246",
    port: "21240",
    username: "mordeckrau50705",
    password: "bxvduwa1wt",
  },
  {
    ip: "204.217.176.101",
    port: "21280",
    username: "mordeckrau50705",
    password: "bxvduwa1wt",
  },
  {
    ip: "204.217.176.28",
    port: "21234",
    username: "mordeckrau50705",
    password: "bxvduwa1wt",
  },
  {
    ip: "104.143.253.105",
    port: "21261",
    username: "mordeckrau50705",
    password: "bxvduwa1wt",
  },
  {
    ip: "172.82.147.54",
    port: "21296",
    username: "mordeckrau50705",
    password: "bxvduwa1wt",
  },
  {
    ip: "104.143.253.203",
    port: "21308",
    username: "mordeckrau50705",
    password: "bxvduwa1wt",
  },
];



// Randomly select one proxy from the list
function getRandomProxy() {
  return proxies[Math.floor(Math.random() * proxies.length)];
}

// ---------------- Main Scraper Function ----------------
// Retry logic and proxy support for Amazon price/seller/delivery scraping
async function scrapePriceWithRetry(url, attempt = 1) {
  const useProxy = false; // Set to true if you want to use proxy for specific cases
  const proxy = useProxy ? getRandomProxy() : null; // Use proxy only if required
  const MAX_RETRIES = 10;

  const launchArgs = ["--no-sandbox", "--disable-setuid-sandbox"];

  if (proxy) {
    launchArgs.push(`--proxy-server=${proxy.ip}:${proxy.port}`);
  }

  let browser;

  try {
        // Launch browser with or without proxy
    browser = await puppeteer.launch({
      headless: true,
      args: launchArgs,
    });

    const page = await browser.newPage();


    // Authenticate proxy credentials if proxy is used
    if (proxy) {
      await page.authenticate({
        username: proxy.username,
        password: proxy.password,
      });
    }

    // ---------------- Setup Page Headers/User-Agent ----------------
    await page.setUserAgent(faker.internet.userAgent());
    await page.setViewport({
      width: faker.datatype.number({ min: 1024, max: 1920 }),
      height: faker.datatype.number({ min: 768, max: 1080 }),
    });

    // Set random headers to mimic real browser behavior
    await page.setExtraHTTPHeaders({
      "Accept-Language": faker.random.arrayElement([
        "en-US",
        "en-GB",
        "fr-FR",
        "de-DE",
      ]),
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
    });

    // Wait for the DOM to load before trying to extract any elements
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Delay utility
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


        // ---------------- Price Extraction ----------------
    async function extractPrice(page) {
      const priceSelectors = [
        '::-p-xpath(//*[@id="aod-price-0"]/div/span[1])',
        '::-p-xpath(//*[@id="aod-price-0"]/div[1]/span[1])',
        '::-p-xpath(//*[@id="aod-price-1"]/div/span[1])',
        '::-p-xpath(//*[@id="aod-price-1"]/div[1]/span[1])',
        "#corePrice_feature_div .a-price .a-offscreen .a-price-whole .aok-offscreen",
        "#corePrice_feature_div > div > div > span.a-price.aok-align-center > span.a-offscreen",
        '::-p-xpath(//*[@id="corePriceDisplay_desktop_feature_div"]/div[1]/span[1]/span[2]/span[3])',
        '::-p-xpath(//*[@id="corePrice_desktop"]/div/table/tbody/tr/td[2]/span[1]/span[1]/span[1])',
        '::-p-xpath(//*[@id="aod-price-0"]/div[1]/span[3]/span[2])',
        '::-p-xpath(//*[@id="aod-price-1"]/div[1]/span[2]/span[2])',
      ];

      const maxAttempts = 6;
      const retryInterval = 500;

      // Try each selector with retry logic
      async function trySelector(selector, attempts = maxAttempts) {
        for (let attempt = 1; attempt <= attempts; attempt++) {
          try {
            const text = await page.$eval(selector, (el) =>
              el?.textContent?.trim()
            );
            if (text) return text;
          } catch {
            // ignore and retry
          }
          if (attempt < attempts) await wait(retryInterval);
        }
        return null;
      }

      // Try each selector once, with retries internally
      for (let i = 0; i < priceSelectors.length; i++) {
        const text = await trySelector(priceSelectors[i]);
        if (text) {
          console.log(`✅ Price found using selector #${i + 1}: ${text}`);
          return text;
        } else {
          console.log(`❌ Failed to find price using selector #${i + 1}`);
        }
      }

      // Try fallback split price (whole + fraction)
      const wholeSelector =
        '::-p-xpath(//*[@id="aod-price-0"]/div[1]/span[3]/span[2]/span[2])';
      const fractionSelector =
        '::-p-xpath(//*[@id="aod-price-0"]/div[1]/span[3]/span[2]/span[3])';

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const [whole, fraction] = await Promise.all([
            page.$eval(wholeSelector, (el) => el?.textContent.trim()),
            page.$eval(fractionSelector, (el) => el?.textContent.trim()),
          ]);
          if (whole && fraction) {
            const combined = `${whole}.${fraction}`;
            console.log(`✅ Combined price from whole/fraction: ${combined}`);
            return combined;
          }
        } catch {
          // ignore and retry
        }
        if (attempt < maxAttempts) await wait(retryInterval);
      }

      console.log("❌ Failed to extract price from all selectors.");
      return null;
    }

        // Clean the extracted price to a consistent float format

    function cleanPrice(rawText) {
      if (!rawText) return null;

      rawText = rawText.replace(/[^0-9.,]/g, "").replace(",", ".");
      rawText = rawText.replace(/\.\.+/g, ".");

      const dot = rawText.indexOf(".");
      if (dot !== -1) {
        rawText =
          rawText.slice(0, dot + 1) + rawText.slice(dot + 1).replace(/\./g, "");
      }

      const match = rawText.match(/(\d{1,3}(?:\.\d{1,2})?)/);
      return match ? parseFloat(match[1]).toFixed(2) : null;
    }

    const rawPriceText = await extractPrice(page);
    const finalPrice = cleanPrice(rawPriceText);
    if (finalPrice) {
      console.log("🎯 Final Price:", finalPrice);
    } else {
      console.warn("🚫 Price could not be extracted.");
    }



        // ---------------- Seller Extraction ----------------
    let seller;
    const sellerSelectors = [
      {
        type: "xpath",
        selector:
          '::-p-xpath(//*[@id="aod-offer-shipsFrom"]/div/div/div[2]/span)',
        label: "Primary XPath for seller",
      },
      {
        type: "css",
        selector:
          "#aod-offer-shipsFrom span.a-fixed-left-grid-col.a-col-right span",
        label: "Fallback 2 (CSS selector)",
      },
      {
        type: "xpath",
        selector:
          '::-p-xpath(//*[@id="fulfillerInfoFeature_feature_div"]/div[2]/div[1]/span)',
        label: "Fallback 3 (fulfillerInfoFeature)",
      },
    ];

    // Helper: Retry logic with interval
    async function trySelectorWithInterval(
      selector,
      label,
      interval = 500,
      timeout = 3000
    ) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        try {
          const result = await page.$eval(selector, (el) =>
            el?.textContent.trim()
          );
          if (result) {
            console.log(`✅ Seller found using ${label}:`, result);
            return result;
          }
        } catch {
          // Ignore and retry
        }
        await new Promise((res) => setTimeout(res, interval));
      }
      console.log(
        `❌ Failed to extract seller using ${label} within ${timeout / 1000}s.`
      );
      return null;
    }

    for (let i = 0; i < sellerSelectors.length; i++) {
      const { selector, label } = sellerSelectors[i];
      console.log(`🔍 Trying ${label}...`);
      seller = await trySelectorWithInterval(selector, label);
      if (seller) break;
    }

    if (!seller) {
      console.log("❌ All seller extraction attempts failed.");
      seller = null;
    }

    // 🔁 Helper: retry with interval
    async function retryWithInterval(fn, retries = 6, delay = 500) {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          return await fn();
        } catch (err) {
          if (attempt < retries - 1) {
            await new Promise((res) => setTimeout(res, delay));
          }
        }
      }
      return null;
    }


        // ---------------- Delivery Time Extraction ----------------
    let deliveryTime;

    try {
      console.log("Trying refined XPath for delivery time...");

      let deliveryText;

      const deliveryXPaths = [
        '::-p-xpath(//*[@id="mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE"]/span/span[contains(@class, "a-text-bold")])',
        '::-p-xpath(//*[@id="mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE"]/span)',
        '::-p-xpath(//*[@id="mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE"]/span/span)',
        '::-p-xpath(//*[@id="mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE"])',
      ];

      for (let i = 0; i < deliveryXPaths.length; i++) {
        const xpath = deliveryXPaths[i];
        deliveryText = await retryWithInterval(
          () => page.$eval(xpath, (el) => el?.textContent.trim()),
          6, // retries
          500 // delay in ms
        );

        if (deliveryText) {
          console.log(
            `✅ Found delivery text at attempt ${i + 1}:`,
            deliveryText
          );
          break;
        } else {
          console.log(`❌ XPath attempt ${i + 1} failed.`);
        }
      }

      if (
        deliveryText?.toLowerCase().includes("price") ||
        /\$\s*\d+/.test(deliveryText)
      ) {
        console.log("❌ Delivery block contains a price. Skipping...");
        deliveryTime = undefined;
      } else if (deliveryText) {
        // let cleanedText = deliveryText
        //   .replace(/(?:Arrives|between|and|on)\s*/gi, "")
        //   .replace(
        //     /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*/gi,
        //     ""
        //   )
        //   .replace(/\s*,\s*/g, " ")
        //   .trim();
        let cleanedText = deliveryText
          // ✅ Remove weekdays like "Monday, ", "Friday " etc.
          .replace(
            /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*/gi,
            ""
          )
          .replace(/(?:Arrives|between|and|on)\s*/gi, "")
          .replace(/\s*,\s*/g, " ")
          .trim();

        const yearEndingRangeMatch = cleanedText.match(
          /^([A-Za-z]+\s\d{1,2})\s*[-–to]+\s*([A-Za-z]+\s\d{1,2})\s+\d{4}$/
        );
        if (yearEndingRangeMatch) {
          cleanedText = `${yearEndingRangeMatch[1]} – ${yearEndingRangeMatch[2]}`;
        }

        console.log("🚚 Raw Delivery Time in asin:", cleanedText);

        const fixDateFormat = (text) => {
          const parts = text.trim().split(" ");
          if (parts.length === 2 && /^\d+$/.test(parts[0])) {
            // "20 June" → "June 20"
            return `${parts[1]} ${parts[0]}`;
          }
          if (
            parts.length === 3 &&
            parts[0].endsWith(",") &&
            /^\d+$/.test(parts[1])
          ) {
            // "Friday, 20 June" → "June 20"
            return `${parts[2]} ${parts[1]}`;
          }
          return text; // Already "June 20", etc.
        };

        if (/^\d{1,2}\s[A-Za-z]+$/.test(cleanedText)) {
          // Simple: "20 June"
          deliveryTime = fixDateFormat(cleanedText.trim());
        } else {
          // Handle: "4 - 10 July"
          const partialRangeMatch = cleanedText.match(
            /^(\d{1,2})\s*[-–to]+\s*(\d{1,2})\s+([A-Za-z]+)$/i
          );

          // Match: "20 June - 8 July" or "June 8 - July 20"
          const rangeMatch =
            cleanedText.match(
              /(\d{1,2}\s[A-Za-z]+)\s*[-–to]+\s*(\d{1,2}\s[A-Za-z]+)/i
            ) ||
            cleanedText.match(
              /([A-Za-z]+\s\d{1,2})\s*[-–to]+\s*([A-Za-z]+\s\d{1,2})/i
            );

          const singleMatch = cleanedText.match(/^([A-Za-z]+\s\d{1,2})$/i);
          const weekdaySingleMatch = cleanedText.match(
            /^[A-Za-z]+,\s\d{1,2}\s[A-Za-z]+$/i
          );

          if (partialRangeMatch) {
            const day1 = partialRangeMatch[1];
            const day2 = partialRangeMatch[2];
            const month = partialRangeMatch[3];

            const part1 = `${month} ${day1}`;
            const part2 = `${month} ${day2}`;
            deliveryTime = `${part1} – ${part2}`;
          } else if (rangeMatch) {
            const part1 = fixDateFormat(rangeMatch[1]);
            const part2 = fixDateFormat(rangeMatch[2]);
            deliveryTime = `${part1} – ${part2}`;
          } else if (singleMatch) {
            deliveryTime = fixDateFormat(singleMatch[1]);
          } else if (weekdaySingleMatch) {
            deliveryTime = fixDateFormat(weekdaySingleMatch[0]);
          } else {
            // Fallback to all matches
            const allMatches = cleanedText.match(/\b([A-Za-z]+)\s(\d{1,2})\b/g);
            if (allMatches?.length === 2) {
              const part1 = fixDateFormat(allMatches[0]);
              const part2 = fixDateFormat(allMatches[1]);
              deliveryTime = `${part1} – ${part2}`;
            } else if (allMatches?.length === 1) {
              deliveryTime = fixDateFormat(allMatches[0]);
            } else {
              console.log("⚠️ Unknown delivery format:", deliveryText);
              deliveryTime = deliveryText;
            }
          }
        }
        console.log("🧼 Cleaned Delivery Time:", deliveryTime);
      } else {
        console.log("❌ No delivery text found at all.");
        deliveryTime = undefined;
      }
    } catch (err) {
      console.log("❌ Delivery time extraction failed.", err.message);
      deliveryTime = undefined;
    }

    // ✅ Retry interval for stock selector
    const stock = await retryWithInterval(
      () =>
        page.$eval('::-p-xpath(//*[@id="availability"]/span)', (el) =>
          el ? el.textContent.trim() : null
        ),
      3,
      500
    );

    console.log(
      `✅ Price: ${finalPrice}, Stock: ${stock}, Seller: ${seller}, deliveryTime: ${deliveryTime}`
    );

    return {
      price: finalPrice || "Not Found",
      stock: stock || "Unknown",
      seller: seller || "Seller Not Found",
      deliveryTime: deliveryTime || "Delivery Not Found",
      proxy,
    };
  } catch (err) {
    console.warn(
      `⚠️ Attempt ${attempt} failed for ${url} using ${proxy}: ${err.message}`
    );
    if (attempt < MAX_RETRIES) {
      return await scrapePriceWithRetry(url, attempt + 1);
    }
    return {
      price: "Error",
      stock: "Error",
      seller: "Error",
      deliveryTime: "Error",
      proxy,
    };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrapePriceWithRetry, RequestQueue };
