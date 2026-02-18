const tesseract = require("tesseract.js");
const fs = require("fs");
const Jimp = require("jimp");
const sharp = require("sharp");

async function ensurePng(imagePath) {
  const info = await sharp(imagePath).metadata();
  if (info.format === "webp") {
    const out = imagePath + ".png";
    await sharp(imagePath).png().toFile(out);
    return out;
  }
  return imagePath;
}

async function preprocess(imagePath) {
  const img = await Jimp.read(imagePath);
  const tmp = `temp-${Date.now()}.png`;
  await img.grayscale().contrast(0.4).normalize().writeAsync(tmp);
  return tmp;
}

async function extractAndParseBill({ imagePath }) {
  if (!fs.existsSync(imagePath)) throw new Error("Image not found");

  const png = await ensurePng(imagePath);
  const processed = await preprocess(png);

  const { data } = await tesseract.recognize(processed, "eng");
  fs.unlinkSync(processed);

  return {
    rawText: data.text,
    parsed: parseBill(data.text),
  };
}

function isTicket(lines) {
  const text = lines.join(" ").toLowerCase();

  // ✈️ Flight ticket indicators
  const flight =
    /boarding pass|flight no|gate\s*\d|seat\s*[0-9]/i.test(text);

  // 🚆 Railway ticket indicators (VERY strict)
  const railway =
    /(indian railway|western railway|railway ticket|uts\s*ticket)/i.test(text);

  return flight || railway;
}

function parseBill(rawText) {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const ticket = isTicket(lines);

  const items = ticket ? [] : getItems(lines);

  return {
    vendor: getVendor(lines), // ✅ now works for tickets
    date: getDate(lines),
    items,
    subtotal: ticket ? null : getSubtotal(lines, items),
    tax: ticket ? null : getTax(lines),
    total: getTotal(lines), // ✅ ticket price now extracted
    payment_mode: getPaymentMode(lines),
  };
}

function getVendor(lines) {
  const text = lines.join(" ").toLowerCase();
  const ticket = isTicket(lines);

  // ✈️ Flight tickets
  if (
    ticket &&
    /air company|airlines|indigo|air india|spicejet|vistara|emirates|qatar/i.test(
      text
    )
  ) {
    for (const l of lines.slice(0, 8)) {
      if (/air|airlines|company/i.test(l)) {
        return l.replace(/[^A-Za-z0-9\s.&]/g, "").trim();
      }
    }
    return "Airline Ticket";
  }

  // 🚆 Indian railway tickets ONLY if ticket detected
  if (
    ticket &&
    /western railway|indian railway|railway ticket|uts|happy journey/i.test(
      text
    )
  ) {
    return "Indian Railways";
  }

  // 🧾 Normal bills
  for (const l of lines.slice(0, 6)) {
    if (
      !/gst|invoice|bill|date|phone|www|@|address|room/i.test(l) &&
      /[A-Za-z]{4,}/.test(l)
    ) {
      return l.replace(/[^A-Za-z0-9\s.&]/g, "").trim();
    }
  }

  return "Unknown";
}

function getDate(lines) {
  const r =
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|([A-Za-z]{3,}\s\d{1,2},?\s\d{4})/;
  for (const l of lines) {
    const m = l.match(r);
    if (m) return m[0];
  }
  return null;
}

function getItems(lines) {
  const items = [];

  const rejectPatterns =
    /address|road|cross|main|street|city|state|country|phone|email|guest|contact|invoice|bill no|receipt|pax|room no|date|time|thank|visit|payment|refund|gst|tax|subtotal|total/i;

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (rejectPatterns.test(lower)) continue;
    if (!/[a-zA-Z]/.test(line)) continue;

    const nums = line.match(/\d+(\.\d+)?/g);
    if (!nums) continue;

    const price = Number(nums[nums.length - 1]);
    if (!price || price <= 0 || price > 50000) continue;

    let qty = 1;
    const qtyMatch = line.match(
      /(\d+)\s*(x|pcs|tabs|tablets|caps|qty|nights)/i,
    );
    if (qtyMatch) qty = Number(qtyMatch[1]);

    let name = line
      .replace(/\$?\s*\d+(\.\d+)?/g, "")
      .replace(/[-_/|]+/g, "")
      .trim();

    name = name.replace(/([a-z])([A-Z])/g, "$1 $2");

    if (/\b[a-z]+\s*(com|net|org|in)\b/i.test(name)) continue;
    if (/@|www|\.com|\.in|\.org|http|email|contact|guest/i.test(name)) continue;
    if (/\b(com|net|org|in)\b/i.test(name) && name.split(" ").length <= 4)
      continue;

    if (name.length < 8) continue;
    if (!/[aeiou]/i.test(name)) continue;
    if (name.split(" ").length < 2) continue;
    if (name.replace(/\s/g, "").length < 10) continue;
    if (/[A-Z]{1,2}\s[A-Z]/.test(name)) continue;

    items.push({ name, qty, price });
  }

  return items;
}

function getSubtotal(lines, items) {
  for (const l of lines) {
    const m = l.match(/subtotal\s*[:\-]?\s*[$₹]?\s*([0-9.]+)/i);
    if (m) return Number(m[1]);
  }
  return items.reduce((sum, i) => sum + (i.price || 0), 0);
}

function getTax(lines) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();

    if (/tax|gst|vat|fees/.test(line)) {
      let nums = lines[i].match(/\d+(\.\d+)?/g);
      if (nums && nums.length) {
        return Number(nums[nums.length - 1]);
      }

      if (lines[i + 1]) {
        nums = lines[i + 1].match(/\d+(\.\d+)?/g);
        if (nums && nums.length) {
          return Number(nums[0]);
        }
      }
    }
  }
  return null;
}

function getTotal(lines) {
  // 🧾 Normal bill totals
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].toLowerCase();

    if (/total|amount due|balance due|grand total/.test(line)) {
      const nums = lines[i].match(/\d+(\.\d+)?/g);
      if (nums && nums.length) return Number(nums[nums.length - 1]);
    }
  }

  // 🚆 Train ticket price (handles broken OCR)
  for (const l of lines) {
    if (/cash/i.test(l)) {
      const nums = l.match(/\d+/g);
      if (nums && nums.length) {
        return Number(nums[nums.length - 1]); // last number near CASH
      }
    }
  }

  // fallback rs detection
  for (const l of lines) {
    const m = l.match(/rs\.?\s*[:\-]?\s*(\d+)/i);
    if (m) return Number(m[1]);
  }

  return null;
}
function getPaymentMode(lines) {
  const text = lines.join(" ").toLowerCase();
  if (/upi|gpay|phonepe|paytm/.test(text)) return "UPI";
  if (/credit|debit|visa|master/i.test(text)) return "Card";
  if (/cash/.test(text)) return "Cash";
  return "Unknown";
}

module.exports = { extractAndParseBill };
