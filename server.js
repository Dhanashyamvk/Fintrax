const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const fileUpload = require("express-fileupload");
const { extractAndParseBill } = require("./bill.js");

const app = express();
const PORT = 3000;

app.use(fileUpload());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, "../frontend")));

app.post("/register", (req, res) => {
    try {
        const { name, mob, email, password } = req.body;

        if (!name || !mob || !email || !password) {
            return res.status(400).send({
                success: false,
                message: "All fields are required"
            });
        }

        const filePath = path.join(__dirname, "users.json");
        let users = [];

        if (fs.existsSync(filePath)) {
            users = JSON.parse(fs.readFileSync(filePath));
        }

        users.push({ name, mob, email, password });

        fs.writeFileSync(filePath, JSON.stringify(users, null, 2));

        res.send({
            success: true,
            redirect: "/login.html"
        });

    } catch (err) {
        console.error(err);
        res.status(500).send({
            success: false,
            message: "Server error"
        });
    }
});

app.post("/login", (req, res) => {
    try {
        const { mob, password } = req.body;
        const filePath = path.join(__dirname, "users.json");

        if (!fs.existsSync(filePath)) {
            return res.status(400).send({
                success: false,
                message: "No users registered"
            });
        }

        const users = JSON.parse(fs.readFileSync(filePath));
        const user = users.find(u => u.mob === mob && u.password === password);

        if (!user) {
            return res.status(401).send({
                success: false,
                message: "Invalid mobile number or password"
            });
        }

        res.send({
            success: true,
            redirect: "/home.html"
        });

    } catch (err) {
        console.error(err);
        res.status(500).send({
            success: false,
            message: "Server error"
        });
    }
});

app.post("/upload-bill", async (req, res) => {
    console.log("Upload-bill route hit");
    try {
        if (!req.files || !req.files.bill) {
            return res.status(400).send({
                success: false,
                message: "No file uploaded"
            });
        }

        const billFile = req.files.bill;
        const uploadDir = path.join(__dirname, "uploads");

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }

        const uploadPath = path.join(
            uploadDir,
            `${Date.now()}-${billFile.name}`
        );

        await billFile.mv(uploadPath);

        const result = await extractAndParseBill({
            imagePath: uploadPath
        });

        if (fs.existsSync(uploadPath)) {
            fs.unlinkSync(uploadPath);
        }

        res.send({
            success: true,
            data: {
                parsed: result.parsed,
                rawText: result.rawText
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).send({
            success: false,
            message: "OCR failed: " + err.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
