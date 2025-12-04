const tesseract = require("tesseract.js");
const fs = require("fs");
const Jimp = require("jimp");

async function extractAndParseBill({ imagePath }) {
  if (!imagePath) throw new Error("No image path provided");
  if (!fs.existsSync(imagePath)) throw new Error("Image file not found");

  const image = await Jimp.read(imagePath);
  const tempPath = `temp-${Date.now()}.png`;
  await image.writeAsync(tempPath);

  const result = await tesseract.recognize(tempPath, "eng");
  const rawText = result.data.text;
  fs.unlinkSync(tempPath);

  const parsed = parseBill(rawText);
  return { rawText, parsed };
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

function looksLikeHeaderLine(line) {
  const lower = line.toLowerCase();
  if (/@|www\.|\.com|\.net|quantiv|phone|tel:|email|name@/.test(lower)) return true;
  return false;
}

function cleanNumberToken(tok) {
  if (!tok) return null;
  const cleaned = tok.replace(/[^0-9.,]/g, "").replace(/,/g, "");
  if (cleaned === "") return null;
  const asNum = Number(cleaned);
  if (!isFinite(asNum)) return null;
  return asNum;
}

function extractAllNumbersFromLine(line) {
  const matches = line.match(/[\d{1,3}(?:,\d{3})?\.?\d*]+|\d+(\.\d+)?/g) || [];
  const nums = [];
  for (const m of matches) {
    const n = cleanNumberToken(m);
    if (n !== null) nums.push(n);
  }
  return nums;
}

function getVendor(lines) {
  for (let line of lines.slice(0, 6)) {
    if (looksLikeHeaderLine(line)) continue;
    if (/[A-Za-z]{2,}/.test(line) && line.split(/\s+/).length >= 2) return line;
  }
  for (let line of lines.slice(0, 6)) {
    if (line) return line;
  }
  return "Unknown Vendor";
}

function getDate(lines) {
  const regex = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|([A-Za-z]+\s\d{1,2},\s\d{4})/;
  for (let line of lines) {
    const m = line.match(regex);
    if (m) return m[0];
  }
  return null;
}

function getItems(lines) {
  const items = [];
  for (let line of lines) {
    if (!line) continue;
    if (looksLikeHeaderLine(line)) continue;
    const low = line.toLowerCase();
    if (/subtotal|total amount|total[:\s]|tax|gst|vat|payment|invoice|terms|contact|address|date/i.test(low)) continue;

    const nums = extractAllNumbersFromLine(line);
    if (nums.length === 0) continue;

    if (nums.length === 1 && nums[0] >= 10000 && !/[.,]/.test(String(nums[0]))) continue;

    const parts = line.split(/\s+/);

    const nameParts = parts.filter(p => {
      const cleaned = p.replace(/^[^\d\-+]*(.*?)[^\d]*$/,'$1');
      const asNum = cleanNumberToken(p);
      if (asNum !== null) return false;
      if (/^\$|^₹|^€/.test(p)) {
        const inner = p.replace(/[^0-9.]/g,'');
        if (inner) return false;
      }
      return true;
    }).map(p => p.replace(/^[\$₹€]+|[\$₹€]+$/g,'').trim());

    const rawName = nameParts.join(" ").replace(/\s{2,}/g," ").trim();
    const lastNum = nums[nums.length - 1];

    let qty = 1;
    let price = lastNum;
    if (nums.length >= 2) {
      const first = nums[0];
      const second = nums[1];
      if (Number.isInteger(first) && first > 0 && first < 100) {
        qty = first;
        if (nums.length === 2) {
          price = +(lastNum / qty);
        } else {
          price = second;
        }
      } else {
        if (nums.length === 2) {
          price = nums[0];
          qty = +(lastNum / price) || 1;
        } else if (nums.length >= 3) {
          price = nums[nums.length - 2];
          const possibleQty = nums[0];
          if (Number.isInteger(possibleQty) && possibleQty > 0 && possibleQty < 100) qty = possibleQty;
        }
      }
    } else {
      qty = 1;
      price = lastNum;
    }

    price = Math.round((Number(price) + Number.EPSILON) * 100) / 100;
    qty = Number(qty);

    if (!rawName) continue;
    if (!isFinite(price) || price <= 0) continue;

    items.push({ name: rawName, qty, price });
  }

  return items;
}

function getSubtotal(lines) {
  for (let line of lines) {
    const m = line.match(/subtotal[:\s]*[$₹€]?([\d,]+\.\d{1,2}|\d+)/i);
    if (m) return Number(m[1].replace(/,/g, ""));
  }
  const items = getItems(lines);
  if (items.length) {
    const s = items.reduce((acc, it) => acc + (it.qty * it.price), 0);
    return Math.round((s + Number.EPSILON) * 100) / 100;
  }
  return null;
}

function getTax(lines) {
  const taxKeywords = /(tax|gst|cgst|sgst|vat|service\s?tax)/i;
  for (let line of lines) {
    if (taxKeywords.test(line)) {
      const nums = extractAllNumbersFromLine(line);
      if (nums.length) {
        return Math.round((Math.max(...nums) + Number.EPSILON) * 100) / 100;
      }
    }
  }

  for (let line of lines) {
    const percMatch = line.match(/(\d{1,2}(?:\.\d+)?)\s?%/);
    if (percMatch) {
      const percent = parseFloat(percMatch[1]);
      const subtotal = getSubtotal(lines) || 0;
      return Math.round((subtotal * (percent / 100) + Number.EPSILON) * 100) / 100;
    }
  }

  return 0;
}

function getTotal(lines) {
  for (let line of lines) {
    if (/total\s*[:\s]/i.test(line)) {
      const nums = extractAllNumbersFromLine(line);
      if (nums.length) {
        return Math.round((Math.max(...nums) + Number.EPSILON) * 100) / 100;
      }
    }
  }

  const subtotal = getSubtotal(lines) || 0;
  const tax = getTax(lines) || 0;
  return Math.round((subtotal + tax + Number.EPSILON) * 100) / 100;
}

function getPaymentMode(lines) {
  const text = lines.join(" ").toLowerCase();
  if (/upi|gpay|phonepe|paytm/.test(text)) return "UPI";
  if (/credit\s?card|cc/.test(text)) return "Credit Card";
  if (/bank\s?transfer|bank transfer/.test(text)) return "Bank Transfer";
  if (/cash/.test(text)) return "Cash";
  return "Unknown";
}

module.exports = { extractAndParseBill };