const express = require('express');
const fs = require('fs');
const router = express.Router();
const bcrypt = require('bcryptjs');

router.use(express.json());

const USERS_FILE = 'invent_users.json';
const validAdminUsernames = ["srushti", "pihu", "admin1", "admin2"];

// Admin login
router.post('/admin-login', (req, res) => {
    const { username, password } = req.body;
    
    if (password !== "inventorykil@2025") {
        return res.status(401).json({ success: false, message: "Invalid Admin Password" });
    }

    // Accept any admin username
    return res.json({ success: true, message: "Admin login successful" });
});

// User login
router.post('/user-login', (req, res) => {
    const { username, password } = req.body;

    if (!/^[a-zA-Z]{8}[0-9]{4}$/.test(password)) {
        return res.status(400).json({ success: false, message: "Invalid password format" });
    }

    // Load users
    let users = [];
    if (fs.existsSync(USERS_FILE)) {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        users = JSON.parse(data);
    }

    const user = users.find(u => u.username === username);
    if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
    }

    // Compare hashed password
    bcrypt.compare(password, user.password, (err, isMatch) => {
        if (isMatch) {
            return res.json({ success: true, message: "User login successful" });
        } else {
            return res.status(401).json({ success: false, message: "Incorrect password" });
        }
    });
});

// User registration
router.post('/register', (req, res) => {
    const { username, password } = req.body;

    if (!/^[a-zA-Z]{8}[0-9]{4}$/.test(password)) {
        return res.status(400).json({ success: false, message: "Invalid password format" });
    }

    let users = [];
    if (fs.existsSync(USERS_FILE)) {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        users = JSON.parse(data);
    }

    if (users.find(u => u.username === username)) {
        return res.status(409).json({ success: false, message: "Username already exists" });
    }

    bcrypt.hash(password, 10, (err, hash) => {
        users.push({ username, password: hash });
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        return res.json({ success: true, message: "Registration successful" });
    });
});

module.exports = router;
