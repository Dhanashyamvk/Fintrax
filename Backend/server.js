const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const fileUpload = require("express-fileupload");
const { exec } = require("child_process");
const { extractAndParseBill } = require("./bill.js");
const db = require("./db");

const app = express();
const PORT = 3000;

app.use(fileUpload());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "../frontend")));

app.post("/getAI", async (req, res) => {
  try {
    const { desc, amount, month, category } = req.body;

    const ai = await getAI(desc, amount, month, category);

    res.json(ai);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI error" });
  }
});

async function getAI(userId, desc, amount, month) {
  return new Promise(async (resolve, reject) => {
    try {
      const [spentRows] = await db.query(
        `SELECT SUM(total) AS spent
         FROM transactions
         WHERE user_id = ?
         AND MONTH(date) = ?
         AND YEAR(date) = YEAR(CURDATE())`,
        [userId, month],
      );

      const spent = spentRows[0].spent || 0;

      const [budgetRows] = await db.query(
        `SELECT SUM(amount) AS budget
         FROM budgets
         WHERE user_id = ?
         AND month = ?
         AND year = YEAR(CURDATE())`,
        [userId, month],
      );

      const budget = budgetRows[0].budget || 0;
      exec(
        `python ai/predict.py "${desc}" ${amount} ${month} ${spent} ${budget}`,
        (err, stdout) => {
          if (err) return reject(err);

          const [category, confidence, future, recommendation] = stdout
            .trim()
            .split("|");

          resolve({
            category,
            confidence,
            future,
            recommendation,
          });
        },
      );
    } catch (err) {
      reject(err);
    }
  });
}

app.post("/register", async (req, res) => {
  try {
    const { name, mob, email, password } = req.body;

    await db.execute(
      "INSERT INTO users (name, mob, email, password) VALUES (?, ?, ?, ?)",
      [name, mob, email, password],
    );

    res.send({ success: true, redirect: "/login.html" });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { mob, password } = req.body;

    const [rows] = await db.execute(
      "SELECT * FROM users WHERE mob=? AND password=?",
      [mob, password],
    );

    if (!rows.length) return res.send({ success: false });

    res.send({
      success: true,
      userId: rows[0].id,
      redirect: "/home.html",
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false });
  }
});

app.post("/upload-bill", async (req, res) => {
  try {
    if (!req.files || !req.files.bill) return res.send({ success: false });

    const file = req.files.bill;
    const uploadDir = path.join(__dirname, "uploads");

    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

    const filePath = path.join(uploadDir, Date.now() + "-" + file.name);

    await file.mv(filePath);

    const result = await extractAndParseBill({ imagePath: filePath });

    fs.unlinkSync(filePath);

    res.send({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error(err);
    res.send({ success: false });
  }
});

app.post("/set-budget", async (req, res) => {
  try {
    const { userId, category, amount, month, year } = req.body;

    await db.execute(
      "INSERT INTO budgets (user_id, category, amount, month, year) VALUES (?,?,?,?,?)",
      [userId, category, amount, month, year],
    );

    res.send({ success: true });
  } catch (err) {
    console.error(err);
    res.send({ success: false });
  }
});

app.get("/budget-data", async (req, res) => {
  const userId = req.query.userId;

  try {
    const [spent] = await db.query(
      `SELECT category, SUM(total) AS spent
       FROM transactions
       WHERE user_id = ?
       GROUP BY category`,
      [userId],
    );

    const [limits] = await db.query(
      `SELECT category, amount
       FROM budgets
       WHERE user_id = ?`,
      [userId],
    );

    const [total] = await db.query(
      `SELECT SUM(total) AS totalSpent
   FROM transactions
   WHERE user_id = ?`,
      [userId],
    );

    res.json({
      limits,
      spent,
      totalSpent: total[0].totalSpent || 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/add-transaction", async (req, res) => {
  try {
    const { userId, vendor, date, total } = req.body;

    const month = new Date(date).getMonth() + 1;

    const ai = await getAI(userId, vendor, total, month);

    await db.execute(
      "INSERT INTO transactions (user_id,vendor,date,total,category) VALUES (?,?,?,?,?)",
      [userId, vendor, date, total, ai.category],
    );

    res.send({
      success: true,
      ai,
    });
  } catch (err) {
    console.error(err);
    res.send({ success: false });
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
    res.send({ success: false });
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
    res.send({ success: false });
  }
});

app.post("/delete-transaction", async (req, res) => {
  try {
    const { id } = req.body;

    await db.execute("DELETE FROM transactions WHERE id=?", [id]);

    res.send({ success: true });
  } catch (err) {
    console.error(err);
    res.send({ success: false });
  }
});

app.get("/ai-recommendations", async (req, res) => {
  try {

    const userId = req.query.userId;

    const [rows] = await db.execute(
      `SELECT vendor,total,date
       FROM transactions
       WHERE user_id=?
       ORDER BY date DESC
       LIMIT 10`,
      [userId]
    );

    let rec = [];

    for (const t of rows) {

      const month = new Date(t.date).getMonth() + 1;

      const ai = await getAI(userId, t.vendor, t.total, month);

      if (ai && ai.recommendation) {
        rec.push(ai.recommendation.trim());
      }

    }

    rec = [...new Set(rec)];

    if (!rec.length) {
      rec.push("Your spending behaviour looks balanced.");
    }

    res.send({
      success: true,
      recommendations: rec.slice(0,4)
    });

  } catch (err) {
    console.error(err);
    res.send({ success:false });
  }
});

app.get("/future-spending", async (req, res) => {
  try {
    const userId = req.query.userId;

    const [rows] = await db.execute(
      `SELECT SUM(total) AS total
       FROM transactions
       WHERE user_id = ?`,
      [userId],
    );

    const spent = Number(rows[0].total) || 0;
    const today = new Date();
    let day = today.getDate();

    if (day < 3) day = 3; 
    const daysInMonth = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0,
    ).getDate();

    const dailyAvg = spent / day;

    // weighted prediction
    const prediction = spent + dailyAvg * (daysInMonth - day);

    res.send({
      success: true,
      prediction: prediction.toFixed(2),
    });
  } catch (err) {
    console.error(err);
    res.send({ success: false });
  }
});


app.get("/graphs-data", async (req, res) => {
  try {
    const userId = req.query.userId;

    const [monthly] = await db.execute(
      `SELECT DATE_FORMAT(date,'%b') as month,SUM(total) as amount
       FROM transactions
       WHERE user_id=?
       GROUP BY month`,
      [userId],
    );

    const [category] = await db.execute(
      `SELECT category,SUM(total) as amount
       FROM transactions
       WHERE user_id=?
       GROUP BY category`,
      [userId],
    );

    res.send({
      success: true,
      monthly,
      category,
    });
  } catch (err) {
    console.error(err);
    res.send({ success: false });
  }
});

app.get("/dashboard-data", async (req, res) => {
  try {
    const userId = req.query.userId;

    const [total] = await db.execute(
      "SELECT SUM(total) as total FROM transactions WHERE user_id=?",
      [userId],
    );

    const [count] = await db.execute(
      "SELECT COUNT(*) as total FROM transactions WHERE user_id=?",
      [userId],
    );

    const [top] = await db.execute(
      `SELECT category,SUM(total) as amount
       FROM transactions
       WHERE user_id=?
       GROUP BY category
       ORDER BY amount DESC
       LIMIT 1`,
      [userId],
    );

    res.send({
      success: true,
      totalSpent: total[0].total || 0,
      totalTransactions: count[0].total || 0,
      topCategory: top.length ? top[0].category : "-",
    });
  } catch (err) {
    console.error(err);
    res.send({ success: false });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
