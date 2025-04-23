// require('dotenv').config();
// const express = require('express');
// const axios = require('axios');
// const cheerio = require('cheerio');
// const cors = require('cors');

// // Configs
// const PORT = process.env.PORT || 3000;
// const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '5', 10);
// const MIN_DELAY = parseInt(process.env.MIN_DELAY || '500', 10);
// const MAX_DELAY = parseInt(process.env.MAX_DELAY || '1500', 10);
// const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3', 10);

// // Sample User-Agents & IPs
// const userAgents = [
//   'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',
//   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...',
//   'Mozilla/5.0 (X11; Linux x86_64)...'
// ];
// const ipAddresses = ['192.168.1.101', '10.0.0.2', '172.16.0.5'];

// // Logger
// const log = (msg, level = 'info') => {
//   const timestamp = new Date().toISOString();
//   console[level](`[${timestamp}] ${msg}`);
// };

// // Utility: Random delay
// const delay = (min, max) => new Promise(res => setTimeout(res, Math.floor(Math.random() * (max - min + 1)) + min));

// // Utility: Random header
// const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];
// const getRandomIP = () => ipAddresses[Math.floor(Math.random() * ipAddresses.length)];

// // Anti-bot page checker
// const isAntiBotPage = ($) => {
//   return $('form[name="captcha"], input[name="captcha"], #captchacharacters, .cf-error-details').length > 0;
// };

// // Product data extractor
// const extractProductData = ($) => {
//   const title = $('#productTitle').text().trim() || $('h1 span').first().text().trim();
//   const price = $('.a-price .a-offscreen').first().text().trim() || 
//                 $('#priceblock_ourprice').text().trim() || 
//                 $('.a-color-price').first().text().trim();
//   const rating = $('.a-icon-star span.a-icon-alt').first().text().match(/[\d.]+/)?.[0] || 'Not available';

//   if (!title || !price) throw new Error('Missing product info');
//   return { title, price, rating };
// };

// // Rate limiter
// const rateLimiter = async (promises, batchSize = 8, delayBetweenBatches = 2000) => {
//   const results = [];
//   for (let i = 0; i < promises.length; i += batchSize) {
//     const batch = promises.slice(i, i + batchSize);
//     const batchResults = await Promise.all(batch);
//     results.push(...batchResults);
//     if (i + batchSize < promises.length) await delay(delayBetweenBatches, delayBetweenBatches + 500);
//   }
//   return results;
// };

// class RequestQueue {
//     constructor(maxConcurrent, minDelay, maxDelay) {
//       this.queue = [];
//       this.running = 0;
//       this.maxConcurrent = maxConcurrent;
//       this.minDelay = minDelay;
//       this.maxDelay = maxDelay;
//     }
  
//     async add(requestFn) {
//       return new Promise((resolve, reject) => {
//         this.queue.push({ requestFn, resolve, reject });
//         this.runNext();
//       });
//     }
  
//     async runNext() {
//       if (this.running >= this.maxConcurrent || this.queue.length === 0) return;
  
//       const { requestFn, resolve, reject } = this.queue.shift();
//       this.running++;
  
//       try {
//         await delay(this.minDelay, this.maxDelay);
//         const result = await requestFn();
//         resolve(result);
//       } catch (error) {
//         reject(error);
//       } finally {
//         this.running--;
//         this.runNext();
//       }
//     }
//   }
  

// // Express setup
// const app = express();
// app.use(cors());
// app.use(express.json());

// const requestQueue = new RequestQueue(MAX_CONCURRENT, MIN_DELAY, MAX_DELAY);

// // This will hold the request statuses for each URL
// let requestStatuses = [];

// // Main scrape route
// app.post('/scrape', async (req, res) => {
//     const { urls } = req.body;
//     if (!Array.isArray(urls)) return res.status(400).json({ error: 'Invalid request. Provide an array of URLs.' });
  
//     const scrapePromises = urls.map((url, index) =>
//       requestQueue.add(() =>
//         makeRequest(url, index).catch(error => {
//           log(`❌ Request ${index + 1} failed: ${error.message}`, 'error');
//           requestStatuses[index] = { url, status: 'failed', error: error.message };
//           return { url, error: error.message };
//         })
//       )
//     );
  
//     // Initialize requestStatuses array
//     requestStatuses = urls.map(url => ({ url, status: 'pending' }));
  
//     try {
//       const results = await rateLimiter(scrapePromises);
//       res.json({ success: true, results });
  
//       // Print status table to the console
//       console.table(requestStatuses);
//     } catch (err) {
//       log(`❌ Unhandled Error: ${err.message}`, 'error');
//       res.status(500).json({ success: false, error: err.message });
//     }
//   });
  

// // Scraping logic with retry
// const makeRequest = async (url, index, retryCount = 0) => {
//     const headers = {
//       'User-Agent': getRandomUserAgent(),
//       'X-Forwarded-For': getRandomIP()
//     };
  
//     const startTime = Date.now(); // Start time before the request
  
//     try {
//       log(`🚀 Request #${index + 1} (Try ${retryCount + 1}) - Fetching ${url}`);
//       const response = await axios.get(url, { headers, timeout: 10000 });
//       const $ = cheerio.load(response.data);
  
//       if (isAntiBotPage($)) throw new Error('Blocked by anti-bot page');
//       const data = extractProductData($);
  
//       const endTime = Date.now(); // End time after the request is completed
//       const timeTaken = (endTime - startTime) / 1000; // Time in seconds
//       log(`✅ Request #${index + 1} succeeded in ${timeTaken.toFixed(2)}s`);
  
//       // Update status
//       requestStatuses[index] = { url, status: 'succeeded', time: `${timeTaken.toFixed(2)}s` };
  
//       return { url, ...data, time: `${timeTaken.toFixed(2)}s` };
  
//     } catch (error) {
//       const endTime = Date.now();
//       const timeTaken = (endTime - startTime) / 1000; // Time in seconds
//       log(`❌ Request #${index + 1} failed in ${timeTaken.toFixed(2)}s: ${error.message}`, 'error');
  
//       // Update status
//       requestStatuses[index] = { url, status: 'failed', error: error.message, time: `${timeTaken.toFixed(2)}s` };
//       return { url, error: error.message, time: `${timeTaken.toFixed(2)}s` };
//     }
//   };
  
  

// // Start server
// app.listen(PORT, () => log(`✅ Server running on port ${PORT}`));


require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const PORT = process.env.PORT || 3000;
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '5', 10);
const MIN_DELAY = parseInt(process.env.MIN_DELAY || '500', 10);
const MAX_DELAY = parseInt(process.env.MAX_DELAY || '1500', 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3', 10);

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
  return { title, price, rating };
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

app.post('/scrape', async (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls)) {
    return res.status(400).json({ error: 'Invalid request. Provide an array of URLs.' });
  }

  requestStatuses = urls.map(url => ({ url, status: 'pending' }));

  try {
    const results = await Promise.all(
      urls.map((url, index) =>
        requestQueue.add(() =>
          makeRequest(url, index).catch(error => {
            log(`❌ Request ${index + 1} failed: ${error.message}`, 'error');
            requestStatuses[index] = { url, status: 'failed', error: error.message };
            return { url, error: error.message };
          })
        )
      )
    );

    res.json({ success: true, results });

    // Show detailed table
    console.table(requestStatuses);

    // Count success and failure
    const successCount = requestStatuses.filter(r => r.status === 'succeeded').length;
    const failureCount = requestStatuses.filter(r => r.status === 'failed').length;
    const total = successCount + failureCount;
    const successPercentage = total > 0 ? ((successCount / total) * 100).toFixed(2) : '0.00';
    
    console.log(`✅ Total Successful: ${successCount}`);
    console.log(`❌ Total Failed: ${failureCount}`);
    console.log(`📈 Success Percentage: ${successPercentage}%`);
    
  } catch (err) {
    log(`❌ Unhandled Error: ${err.message}`, 'error');
    res.status(500).json({ success: false, error: err.message });
  }
});

const makeRequest = async (url, index) => {
  const headers = {
    'User-Agent': getRandomUserAgent(),
    'X-Forwarded-For': getRandomIP()
  };

  const startTime = Date.now();

  try {
    log(`🚀 Request #${index + 1} - Fetching ${url}`);
    const response = await axios.get(url, { headers, timeout: 10000 });
    const $ = cheerio.load(response.data);

    if (isAntiBotPage($)) throw new Error('Blocked by anti-bot page');
    const data = extractProductData($);

    const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`✅ Request #${index + 1} succeeded in ${timeTaken}s`);

    requestStatuses[index] = { url, status: 'succeeded', time: `${timeTaken}s` };
    return { url, ...data, time: `${timeTaken}s` };

  } catch (error) {
    const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`❌ Request #${index + 1} failed in ${timeTaken}s: ${error.message}`, 'error');

    requestStatuses[index] = { url, status: 'failed', error: error.message, time: `${timeTaken}s` };
    return { url, error: error.message, time: `${timeTaken}s` };
  }
};

app.listen(PORT, () => log(`✅ Server running on port ${PORT}`));
