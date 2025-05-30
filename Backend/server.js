require("dotenv").config();
const express = require("express");
const cron = require("node-cron");
const scrapeManager = require("./scrapeManager");
const { SHEETS } = require("./configSheet");
const {logMemoryUsage} = require('./utils/memory')

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// REST endpoint: scrape all sheets
app.get("/api/scrape", async (req, res) => {
  console.log("🚀 Requested to scrape ALL sheets");
  if (scrapeManager.isRunning()) {
    console.log("⚠️ Scraper is already running. Rejecting ALL sheets request.");
    return res.status(429).json({ message: "Scraper is already running" });
  }

  try {
    logMemoryUsage('Started Scraping');
    await scrapeManager.runAllSheets(SHEETS, 2);
    console.log("✅ Successfully scraped ALL sheets");
    res.status(200).json({ message: "Scraping completed" });
  } catch (err) {
    console.error("❌ Failed to scrape ALL sheets:", err);
    res.status(500).json({ message: "Scraping failed", error: err.message });
  }finally{
    logMemoryUsage('Finished Scraping');
  }
});

// REST endpoint: scrape single sheet
app.get("/api/scrape/:sheetId", async (req, res) => {
  const { sheetId } = req.params;
  console.log(`🚀 Requested to scrape sheet: ${sheetId}`);

  if (scrapeManager.isRunning()) {
    console.log(`⚠️ Scraper is already running. Rejecting sheet: ${sheetId}`);
    return res.status(429).json({ message: "Scraper is already running" });
  }

  try {
    await scrapeManager.runSingleSheet(sheetId);
    console.log(`✅ Successfully scraped sheet: ${sheetId}`);
    res.status(200).json({ message: `Scraped sheet ${sheetId}` });
  } catch (err) {
    console.error(`❌ Failed to scrape sheet ${sheetId}:`, err);
    res.status(500).json({ message: "Scraping failed", error: err.message });
  }
});

// REST endpoint: check status
app.get("/api/status", (req, res) => {
  const status = scrapeManager.isRunning();
  console.log("📊 Scraper status requested:", status ? "🟠 Running" : "🟢 Idle");
  res.status(200).json({ running: status });
});

// 🔁 Cron job: run every 3 hour at minute 0
cron.schedule("0 */3 * * *", () => {
  const now = new Date();
  console.log(`⏰ Cron triggered at ${now.toLocaleTimeString()}`);
  runScraper();
}, {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
});

// 🧠 Scraper runner
async function runScraper() {
  if (scrapeManager.isRunning()) {
    console.log("⚠️ Cron skipped: Scraper is already running");
    return;
  }

  try {
    await scrapeManager.runAllSheets(SHEETS, 2);
    console.log(`✅ Cron scrape complete at ${new Date().toLocaleString()}`);
  } catch (err) {
    console.error("❌ Cron scrape failed:", err);
  }
}

  console.log(`⏰ Cron triggered after Every 3 Hours! ${new Date().toLocaleTimeString()}`);



setInterval(() => {
  logMemoryUsage('Heap Usage After 10 sec')
}, 10000);

// 🚀 Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});


