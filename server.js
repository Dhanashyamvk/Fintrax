const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, "../frontend")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.post("/register", (req, res) => {
    try {
        const { name, mob, email, password } = req.body;
        if(!name || !mob || !email || !password) {
            return res.status(400).send({ success: false, message: "All fields are required" });
        }

        const user = { name, mob, email, password };
        const filePath = path.join(__dirname, "users.json");
        let users = [];
        if (fs.existsSync(filePath)) {
            users = JSON.parse(fs.readFileSync(filePath));
        }

        users.push(user);
        fs.writeFileSync(filePath, JSON.stringify(users, null, 2));

        res.send({ success: true, redirect: "/login.html" });
    } catch (err) {
        console.error(err);
        res.status(500).send({ success: false, message: "Server error" });
    }
});

app.post("/login", (req, res) => {
    try {
        const { mob, password } = req.body;
        const filePath = path.join(__dirname, "users.json");

        if(!fs.existsSync(filePath)) {
            return res.status(400).send({ success: false, message: "No users registered" });
        }

        const users = JSON.parse(fs.readFileSync(filePath));
        const user = users.find(u => u.mob === mob && u.password === password);

        if(user) {
            res.send({ success: true, redirect: "/home.html" });
        } else {
            res.status(401).send({ success: false, message: "Invalid mobile number or password" });
        }
    } catch(err) {
        console.error(err);
        res.status(500).send({ success: false, message: "Server error" });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
