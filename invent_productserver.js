require('dotenv').config();
const express = require('express');
const fs = require('fs');
const router = express.Router();
router.use(express.json());
const path = require('path');

const STOCK_FILE = './invent_stock.json';
const HISTORY_FILE = './invent_history.json';
function readStock() {
    return JSON.parse(fs.readFileSync(STOCK_FILE, 'utf8'));
}
function writeStock(data) {
    fs.writeFileSync(STOCK_FILE, JSON.stringify(data, null, 4));
}
function readHistory() {
    try {
        return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch (err) {
        return [];
    }
}
function writeHistory(data) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 4));
}
function appendHistory(entry) {
    let history = [];
    try {
        history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch (err) {
        console.error("History file error", err);
    }
    history.push(entry);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 4));
}
router.get('/', (req, res) => {
    res.send('Welcome to the Inventory Server!');
});
router.get('/stock', (req, res) => {
    const data = readStock();
    res.json(data);
});
router.get('/stock/:product', (req, res) => {
    const product = decodeURIComponent(req.params.product).trim();
    const data = readStock();
    if (data[product]) {
        const productData = data[product];
        const pending = productData.purchased - productData.consumption;
        res.json({ ...productData, pending });
    } else {
        res.status(404).json({ error: 'Product not found' });
    }
});
router.get('/stock/report/:product', (req, res) => {
    const product = decodeURIComponent(req.params.product).trim();
    const data = readStock();  
    if (!data[product]) {
        return res.status(404).json({ error: 'Product not found' });
    }
    const productData = data[product];
    const pending = productData.purchased - productData.consumption;
    res.json({ ...productData, pending });
});
router.get('/stock/history/:product', (req, res) => {
    const product = decodeURIComponent(req.params.product).trim();
    const history = readHistory();
    const filtered = history.filter(entry => entry.product === product);
    res.json(filtered);
});
router.post('/stock/in', (req, res) => {
    const product = (req.body.product || '').trim();
    const quantity = req.body.quantity;
    const stockData = readStock();
    if (!stockData[product]) {
        return res.status(404).json({ success: false, message: 'Product not found' });
    }
    stockData[product].purchased += quantity;
    stockData[product].stock = stockData[product].purchased - stockData[product].consumption;
    writeStock(stockData);
    appendHistory({
        type: 'IN',
        product,
        quantity,
        date: new Date().toISOString()
    });
    res.json({ success: true, message: `Stock IN updated for ${product}` });
});
router.post('/stock/out', (req, res) => {
    const { product, quantity } = req.body;
    const stockData = readStock();
    if (!stockData[product]) {
        return res.status(404).json({ success: false, message: 'Product not found' });
    }
    const available = (stockData[product].purchased || 0) - (stockData[product].consumption || 0);
    if (available < quantity) {
        return res.status(400).json({ success: false, message: "Not enough stock" });
    }
    stockData[product].consumption += quantity;
    stockData[product].stock = stockData[product].purchased - stockData[product].consumption;
    writeStock(stockData);
    appendHistory({
        type: 'OUT',
        product,
        quantity,
        date: new Date().toISOString()
    });
    res.json({ success: true, message: `Stock OUT updated for ${product}` });
});
router.post('/stock/addProduct', (req, res) => {
    const name = (req.body.name || '').trim();
    const quantity = req.body.quantity;
    const data = readStock();
    if (data[name]) return res.status(400).json({ error: 'Product already exists' });
    data[name] = {
        stock: quantity,
        purchased: quantity,
        consumption: 0
    };
    writeStock(data);
    appendHistory({
        type: 'IN',
        product: name,
        quantity: quantity,
        date: new Date().toISOString()
    });
    res.json({ message: 'Product added', data: data[name] });
});
router.get('/stock/history', (req, res) => {
    const history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    res.json(history);
});
router.get('/stock/report/download/:product', (req, res) => {
    const productParam = decodeURIComponent(req.params.product).trim();
    const { fromDate, toDate } = req.query;
    try {
        let history = readHistory().filter(entry => entry.product === productParam);
        const stockData = readStock();
        if (!stockData[productParam]) {
            return res.status(404).json({ error: 'Product not found' });
        }
        if (fromDate && toDate) {
            const from = new Date(fromDate);
            const to = new Date(toDate);
            to.setHours(23, 59, 59, 999);
            history = history.filter(entry => {
                const entryDate = new Date(entry.date);
                return entryDate >= from && entryDate <= to;
            });
        }
        history.sort((a, b) => new Date(a.date) - new Date(b.date));
        const headers = ['Product', 'Date', 'IN Quantity', 'OUT Quantity', 'Remaining Stock'];
        const colWidths = [20, 25, 15, 15, 20];
        const pad = (str, width) => str.toString().padEnd(width, ' ');
        let output = '|' + headers.map((h, i) => pad(h, colWidths[i])).join('|') + '|\n';
        output += '+' + colWidths.map(w => '-'.repeat(w)).join('+') + '+\n';
        history.forEach(entry => {
            const { quantity, type, date } = entry;
            const inQty = type === 'IN' ? quantity : '';
            const outQty = type === 'OUT' ? quantity : '';
            const remaining = stockData[productParam].purchased - stockData[productParam].consumption;
            const row = [
                pad(productParam, colWidths[0]),
                pad(new Date(date).toLocaleString(), colWidths[1]),
                pad(inQty, colWidths[2]),
                pad(outQty, colWidths[3]),
                pad(remaining, colWidths[4])
            ];
            output += '|' + row.join('|') + '|\n';
        });
        const filename = `Stock_Report_${productParam}_${new Date().toISOString().split('T')[0]}.txt`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'text/plain');
        res.send(output);
    } catch (error) {
        console.error('Error in /stock/report/download/:product', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
module.exports = router;