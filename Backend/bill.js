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
    parsed: parseBill(data.text)
  };
}

function parseBill(rawText) {
  const lines = rawText
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  return {
    vendor: getVendor(lines),
    date: getDate(lines),
    items: getItems(lines),
    subtotal: getSubtotal(lines),
    tax: getTax(lines),
    total: getTotal(lines),
    payment_mode: getPaymentMode(lines)
  };
}

function getVendor(lines) {
  for (const l of lines.slice(0, 6)) {
    if (!/@|www|\.com|gst|phone/i.test(l) && /[A-Za-z]{3,}/.test(l)) {
      return l;
    }
  }
  return "Unknown";
}

function getDate(lines) {
  const r = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|([A-Za-z]+\s\d{1,2},\s\d{4})/;
  for (const l of lines) {
    const m = l.match(r);
    if (m) return m[0];
  }
  return null;
}

function getItems(lines) {
  const items = [];

  for (const line of lines) {
    if (/subtotal|total|tax|gst|cgst|sgst|cash|upi|card/i.test(line)) continue;
    if (/@|www|\.com|invoice|bill/i.test(line)) continue;

    const nums = line.match(/\d+(\.\d+)?/g);
    if (!nums || nums.length === 0) continue;

    const price = Number(nums[nums.length - 1]);
    const qty = nums.length > 1 ? Number(nums[0]) : 1;

    const name = line.replace(/[0-9.,]/g, "").trim();
    if (name.length < 3) continue;

    items.push({ name, qty, price });
  }
  return items;
}

function getSubtotal(lines) {
  for (const l of lines) {
    const m = l.match(/subtotal\s*[:\-]?\s*([0-9.]+)/i);
    if (m) return Number(m[1]);
  }

  const items = getItems(lines);
  return items.reduce((s, i) => s + i.qty * i.price, 0);
}

function getTax(lines) {
  let tax = 0;
  for (const l of lines) {
    if (/tax|gst|cgst|sgst|vat/i.test(l)) {
      const nums = l.match(/\d+(\.\d+)?/g);
      if (nums) tax += Number(nums[nums.length - 1]);
    }
  }
  return tax;
}

function getTotal(lines) {
  for (const l of lines) {
    const m = l.match(/\btotal\b\s*[:\-]?\s*([0-9.]+)/i);
    if (m) return Number(m[1]);
  }
  return getSubtotal(lines) + getTax(lines);
}

function getPaymentMode(lines) {
  const text = lines.join(" ").toLowerCase();
  if (/upi|gpay|phonepe|paytm/.test(text)) return "UPI";
  if (/credit|debit/.test(text)) return "Card";
  if (/cash/.test(text)) return "Cash";
  return "Unknown";
}

module.exports = { extractAndParseBill };
