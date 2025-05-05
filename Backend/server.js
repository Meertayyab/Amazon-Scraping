require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const updateSheet = require('./googleSheet');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '5', 10);
const MIN_DELAY = parseInt(process.env.MIN_DELAY || '500', 10);
const MAX_DELAY = parseInt(process.env.MAX_DELAY || '1500', 10);

const PROGRESS_FILE = path.join(__dirname, 'progress.json');
const URLS_FILE = path.join(__dirname, 'urls.json');

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...',
  'Mozilla/5.0 (X11; Linux x86_64)...'
];
const ipAddresses = ['192.168.1.101', '10.0.0.2', '172.16.0.5'];

const log = (msg, level = 'info') => {
  const timestamp = new Date().toLocaleString();
  console[level](`[${timestamp}] ${msg}`);
};

const delay = (min, max) => new Promise(res => setTimeout(res, Math.floor(Math.random() * (max - min + 1)) + min));
const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];
const getRandomIP = () => ipAddresses[Math.floor(Math.random() * ipAddresses.length)];

const isAntiBotPage = ($) =>
  $('form[name="captcha"], input[name="captcha"], #captchacharacters, .cf-error-details').length > 0;

const extractProductData = ($) => {
  const title = $('#productTitle').text().trim() || $('h1 span').first().text().trim();
  const price = $('.a-price .a-offscreen').first().text().trim() ||
                $('#priceblock_ourprice').text().trim() ||
                $('.a-color-price').first().text().trim();
  const rating = $('.a-icon-star span.a-icon-alt').first().text().match(/[\d.]+/)?.[0] || 'Not available';

  if (!title || !price) throw new Error('Missing product info');

  const sanitizedPrice = parseFloat(price.replace(/[^0-9.]/g, ''));
  const finalPrice = isNaN(sanitizedPrice) ? '' : sanitizedPrice;

  return { title, price: finalPrice };
};

class RequestQueue {
  constructor(maxConcurrent, minDelay, maxDelay) {
    this.queue = [];
    this.running = 0;
    this.maxConcurrent = maxConcurrent;
    this.minDelay = minDelay;
    this.maxDelay = maxDelay;
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
      await delay(this.minDelay, this.maxDelay);
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

const app = express();
app.use(cors());
app.use(express.json());

const requestQueue = new RequestQueue(MAX_CONCURRENT, MIN_DELAY, MAX_DELAY);
let requestStatuses = [];

const readProgress = () => {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  } catch {
    return { batchIndex: 0, startingRow: 2 };
  }
};

const writeProgress = (progress) => {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
};

app.get('/scrape', async (req, res) => {
  const urls = JSON.parse(fs.readFileSync(URLS_FILE, 'utf-8'));
  const BATCH_SIZE = 10;
  const delayBetweenBatches = ms => new Promise(res => setTimeout(res, ms));

  const batchUrls = (allUrls, batchSize) => {
    const batches = [];
    for (let i = 0; i < allUrls.length; i += batchSize) {
      batches.push(allUrls.slice(i, i + batchSize));
    }
    return batches;
  };


 
  const batches = batchUrls(urls, BATCH_SIZE);
  const allResults = [];

  const progress = readProgress();
  let startingRow = progress.startingRow;

  for (let i = progress.batchIndex; i < batches.length; i++) {
    const batch = batches[i];
    log(`🔁 Sending batch ${i + 1}/${batches.length}...`);
    requestStatuses = batch.map(url => ({ url, status: 'pending' }));

    try {
      const results = await Promise.all(
        batch.map((url, index) =>
          requestQueue.add(() =>
            makeRequest(url, index).catch(error => {
              log(`❌ Request ${index + 1} failed: ${error.message}`, 'error');
              requestStatuses[index] = { url, status: 'failed', error: error.message };
              return { url, error: error.message };
            })
          )
        )
      );

      const successfulProducts = results.filter(p => !p.error && p.price);
      if (successfulProducts.length > 0) {
        await updateSheet(successfulProducts, startingRow);
        startingRow += successfulProducts.length;
      }

      allResults.push(...results);

      // Update progress.json
      writeProgress({ batchIndex: i + 1, startingRow });

      console.table(results.map(r => ({
        URL: r.url,
        IP: r.ip,
        Price: r.price || 'N/A',
        Time: r.time,
        Status: r.error ? `❌ ${r.error}` : '✅ Success'
      })));

      await delayBetweenBatches(5000); // optional delay
    } catch (err) {
      log(`❌ Error in batch ${i + 1}: ${err.message}`, 'error');
    }
  }

  res.json({ message: 'Scraping completed', total: allResults.length });
});

app.get('/reset', (req, res) => {
  writeProgress({ batchIndex: 0, startingRow: 1 });
  log(`🔄 Progress reset.`);
  res.json({ message: 'Progress has been reset.' });
});

const makeRequest = async (url, index) => {
  const ip = getRandomIP();
  const headers = {
    'User-Agent': getRandomUserAgent(),
    'X-Forwarded-For': ip
  };

  const startTime = Date.now();

  try {
    log(`🚀 Request #${index + 1} - Fetching ${url} using IP ${ip}`);
    const response = await axios.get(url, { headers, timeout: 10000 });
    const $ = cheerio.load(response.data);

    if (isAntiBotPage($)) throw new Error('Blocked by anti-bot page');
    const data = extractProductData($);

    const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`✅ Request #${index + 1} succeeded in ${timeTaken}s`);

    requestStatuses[index] = { url, ip, status: 'succeeded', time: `${timeTaken}s` };
    return { url, ip, ...data, time: `${timeTaken}s` };

  } catch (error) {
    const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`❌ Request #${index + 1} failed in ${timeTaken}s: ${error.message}`, 'error');

    requestStatuses[index] = { url, ip, status: 'failed', error: error.message, time: `${timeTaken}s` };
    return { url, ip, error: error.message, time: `${timeTaken}s` };
  }
};

app.listen(PORT, () => log(`✅ Server running on port ${PORT}`));


