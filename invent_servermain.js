require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();

const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Import route handlers (each file will handle related routes)
const loginRoutes = require('./invent_serverlogin');      // for admin & user login
const productRoutes = require('./invent_productserver');  // for adding/viewing product info

// Use API route handlers
app.use('/login', loginRoutes);           // admin-login, user-login
app.use('/product', productRoutes);       // product info: add, get, etc.

// Test route
app.get('/', (req, res) => {
    res.json({ success: true, message: '📦 Inventory Server is running!' });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(` Server running on port ${PORT}`);
});
