const puppeteer = require('puppeteer');

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
  "http://mordeckrau50705:bxvduwa1wt@104.143.253.203:21308"
];

const getRandomProxy = () => proxies[Math.floor(Math.random() * proxies.length)];

(async () => {
  const fullProxy = getRandomProxy();
  const [protocol, authHost] = fullProxy.split('://');
  const [auth, host] = authHost.split('@');
  const proxyServer = host;
  const [username, password] = auth.split(':');

  const browser = await puppeteer.launch({
    headless: true,
    args: [`--proxy-server=${proxyServer}`],
  });

  const page = await browser.newPage();

  // Set proxy authentication if required
  await page.authenticate({ username, password });

  try {
    await page.goto('https://www.google.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log("✅ Page loaded successfully through proxy:", proxyServer);
  } catch (err) {
    console.error("❌ Failed to load page through proxy:", proxyServer, "\nError:", err.message);
  }

  await browser.close();
})();
