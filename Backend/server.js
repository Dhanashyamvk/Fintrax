const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const fileUpload = require("express-fileupload");
const { extractAndParseBill } = require("./bill.js");
const db = require("./db");

const app = express();
const PORT = 3000;

const { exec } = require("child_process");
function getAI(desc, amount, month) {
  return new Promise((resolve, reject) => {
    exec(`python ai/predict.py "${desc}" ${amount} ${month}`, (err, stdout) => {
      if (err) return reject(err);

      let [category, confidence, future, insight, recommendation] = stdout
        .trim()
        .split("|");

      resolve({ category, confidence, future, insight, recommendation });
    });
  });
}

app.use(fileUpload());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, "../frontend")));

app.post("/register", async (req, res) => {
  try {
    const { name, mob, email, password } = req.body;

    if (!name || !mob || !email || !password) {
      return res.status(400).send({
        success: false,
        message: "All fields are required",
      });
    }

    await db.execute(
      "INSERT INTO users (name, mob, email, password) VALUES (?, ?, ?, ?)",
      [name, mob, email, password],
    );

    res.send({
      success: true,
      redirect: "/login.html",
    });
  } catch (err) {
    console.error(err);

    res.status(500).send({
      success: false,
      message: "Database error",
    });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { mob, password } = req.body;

    const [rows] = await db.execute(
      "SELECT * FROM users WHERE mob=? AND password=?",
      [mob, password],
    );

    if (rows.length === 0) {
      return res.status(401).send({
        success: false,
        message: "Invalid mobile number or password",
      });
    }

    const user = rows[0];

    res.send({
      success: true,
      userId: user.id, // ⭐ send user id
      redirect: "/home.html",
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false });
  }
});

app.post("/upload-bill", async (req, res) => {
  console.log("Upload-bill route hit");
  try {
    if (!req.files || !req.files.bill) {
      return res.status(400).send({
        success: false,
        message: "No file uploaded",
      });
    }

    const billFile = req.files.bill;
    const uploadDir = path.join(__dirname, "uploads");

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }

    const uploadPath = path.join(uploadDir, `${Date.now()}-${billFile.name}`);

    await billFile.mv(uploadPath);
    const result = await extractAndParseBill({
      imagePath: uploadPath,
    });

    if (fs.existsSync(uploadPath)) {
      fs.unlinkSync(uploadPath);
    }

    res.send({
      success: true,
      data: {
        parsed: result.parsed,
        rawText: result.rawText,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({
      success: false,
      message: "OCR failed: " + err.message,
    });
  }
});

app.post("/set-budget", async (req, res) => {
  try {
    const { userId, category, amount } = req.body;

    await db.execute(
      "INSERT INTO budgets (user_id, category, amount) VALUES (?, ?, ?)",
      [userId, category, amount],
    );

    res.send({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false });
  }
});

app.get("/budgets", async (req, res) => {
  try {
    const userId = req.query.userId;

    const [rows] = await db.execute(
      "SELECT * FROM budgets WHERE user_id=? ORDER BY id DESC",
      [userId],
    );

    res.send({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false });
  }
});
app.get("/budget-data", async (req, res) => {
  try {
    const userId = req.query.userId;

    const [limits] = await db.execute(
      "SELECT category,amount FROM budgets WHERE user_id=?",
      [userId],
    );

    const [spent] = await db.execute(
      "SELECT category,SUM(total) as spent FROM transactions WHERE user_id=? GROUP BY category",
      [userId],
    );

    res.send({
      success: true,
      limits,
      spent,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false });
  }
});
app.get("/transactions", async (req, res) => {
  try {
    const userId = req.query.userId;

    const [rows] = await db.execute(
      "SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC",
      [userId],
    );

    res.send({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false });
  }
});

app.post("/update-category", async (req, res) => {
  try {
    const { id, category } = req.body;

    await db.execute("UPDATE transactions SET category=? WHERE id=?", [
      category,
      id,
    ]);

    res.send({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false });
  }
});

app.post("/add-transaction", async (req, res) => {
  try {
    const { userId, vendor, date, total } = req.body;

    // 🔥 Extract month from date for AI
    const month = new Date(date).getMonth() + 1;

    // 🔥 CALL LOCAL AI
    const ai = await getAI(vendor, total, month);

    console.log("AI RESULT:", ai);

    await db.execute(
      "INSERT INTO transactions (user_id, vendor, date, total, category) VALUES (?, ?, ?, ?, ?)",
      [userId, vendor, date, total, ai.category],
    );

    res.send({
      success: true,
      ai,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false });
  }
});

app.get("/transactions", async (req, res) => {
  try {
    const userId = req.query.userId;

    const [rows] = await db.execute(
      "SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC",
      [userId],
    );

    res.send({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false });
  }
});

app.post("/delete-transaction", async (req, res) => {
  try {
    const { id } = req.body;

    await db.execute("DELETE FROM transactions WHERE id=?", [id]);

    res.send({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false });
  }
});

app.get("/recommendations-data", async (req, res) => {
  try {
    const userId = req.query.userId;

    const [rows] = await db.execute(
      "SELECT category, SUM(total) as amount FROM transactions WHERE user_id=? GROUP BY category",
      [userId],
    );

    res.send({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false });
  }
});
app.get("/ai-recommendations", async (req, res) => {
  try {
    const userId = req.query.userId;

    const [rows] = await db.execute(
      "SELECT category, SUM(total) as amount FROM transactions WHERE user_id=? GROUP BY category",
      [userId],
    );

    let recommendations = [];
    let seen = new Set();
    let totalFuture = 0;

    for (const r of rows) {
      try {
        const ai = await getAI(r.category, r.amount, 1);

        totalFuture += Number(ai.future || 0);

        const rec = ai.recommendation;

        if (
          rec &&
          rec !== "None" &&
          typeof rec === "string" &&
          rec.trim() !== "" &&
          !seen.has(rec)
        ) {
          seen.add(rec);
          recommendations.push(rec);
        }
      } catch (aiErr) {
        console.log("AI ERROR:", aiErr);
      }
    }

    if (recommendations.length > 1) {
      recommendations = recommendations.filter(
        (r) => r !== "Spending behaviour looks balanced.",
      );
    }

    recommendations = recommendations.slice(0, 4);

    res.send({
      success: true,
      recommendations,
      totalFuture: totalFuture.toFixed(2),
    });
  } catch (err) {
    console.error("RECOMMENDATION ROUTE ERROR:", err);
    res.status(500).send({ success: false });
  }
});

app.get("/graphs-data", async (req, res) => {
  try {
    const userId = req.query.userId;

    const [monthly] = await db.execute(
      "SELECT DATE_FORMAT(date,'%b') as month,SUM(total) as amount FROM transactions WHERE user_id=? GROUP BY month",
      [userId],
    );

    const [category] = await db.execute(
      "SELECT category,SUM(total) as amount FROM transactions WHERE user_id=? GROUP BY category",
      [userId],
    );

    res.send({ success: true, monthly, category });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false });
  }
});

app.get("/graphs-data", async (req, res) => {
  try {
    const userId = req.query.userId;

    const [category] = await db.execute(
      "SELECT category,SUM(total) as amount FROM transactions WHERE user_id=? GROUP BY category",
      [userId],
    );

    const [monthly] = await db.execute(
      "SELECT DATE_FORMAT(date,'%b') as month,SUM(total) as amount FROM transactions WHERE user_id=? GROUP BY month",
      [userId],
    );

    res.send({ success: true, category, monthly });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false });
  }
});

app.get("/patterns-data", async (req, res) => {
  try {
    const userId = req.query.userId;

    const [totals] = await db.execute(
      "SELECT SUM(total) as total FROM transactions WHERE user_id=?",
      [userId],
    );

    const [categories] = await db.execute(
      "SELECT category,SUM(total) as amount FROM transactions WHERE user_id=? GROUP BY category ORDER BY amount DESC",
      [userId],
    );

    res.send({
      success: true,
      total: totals[0].total || 0,
      categories,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false });
  }
});

app.get("/dashboard-data", async (req, res) => {
  try {
    const userId = req.query.userId;

    const [totalSpent] = await db.execute(
      "SELECT SUM(total) as total FROM transactions WHERE user_id=?",
      [userId],
    );

    const [count] = await db.execute(
      "SELECT COUNT(*) as total FROM transactions WHERE user_id=?",
      [userId],
    );

    const [top] = await db.execute(
      "SELECT category,SUM(total) as amount FROM transactions WHERE user_id=? AND category!='' GROUP BY category ORDER BY amount DESC LIMIT 1",
      [userId],
    );

    res.send({
      success: true,
      totalSpent: totalSpent[0].total || 0,
      totalTransactions: count[0].total || 0,
      topCategory: top.length ? top[0].category : "—",
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
