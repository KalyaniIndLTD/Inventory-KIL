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

function capitalize(word) {
    return word
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

function findActualProductKey(inputName) {
    const stock = readStock();
    const lower = inputName.toLowerCase();
    return Object.keys(stock).find(p => p.toLowerCase() === lower);
}

router.get('/', (req, res) => {
    res.send('Welcome to the Inventory Server!');
});
router.get('/stock', (req, res) => {
    const data = readStock();
    res.json(data);
});
router.get('/stock/:product', (req, res) => {
    const name = decodeURIComponent(req.params.product).trim();
    const actualKey = findActualProductKey(name);
    if (!actualKey) {
        return res.status(404).json({ error: 'Product not found' });
    }
    const data = readStock();
    const productData = data[actualKey];
    const pending = productData.purchased - productData.consumption;
    res.json({ ...productData, pending });
});
router.get('/stock/report/:product', (req, res) => {
    const name = decodeURIComponent(req.params.product).trim();
    const actualKey = findActualProductKey(name);
    if (!actualKey) {
        return res.status(404).json({ error: 'Product not found' });
    }
    const data = readStock();  
    const productData = data[actualKey];
    const pending = productData.purchased - productData.consumption;
    res.json({ ...productData, pending });
});
router.get('/stock/history/:product', (req, res) => {
    const name = decodeURIComponent(req.params.product).trim();
    const actualKey = findActualProductKey(name);
    if (!actualKey) {
        return res.status(404).json({ error: 'Product not found' });
    }
    const history = readHistory();
    const filtered = history.filter(entry => entry.product.toLowerCase() === actualKey.toLowerCase());
    res.json(filtered);
});
router.post('/stock/in', (req, res) => {
    const inputName = (req.body.product || '').trim();
    const quantity = req.body.quantity;
    const actualKey = findActualProductKey(inputName); //
    if (!actualKey) {
        return res.status(404).json({ success: false, message: 'Product not found' });
    }
    const stockData = readStock();
    stockData[actualKey].purchased += quantity;
    stockData[actualKey].stock = stockData[actualKey].purchased - stockData[actualKey].consumption;
    writeStock(stockData);
    appendHistory({
        type: 'IN',
        product: actualKey,
        quantity,
        date: new Date().toISOString()
    });
    res.json({ success: true, message: `Stock IN updated for ${actualKey}` });
});
router.post('/stock/out', (req, res) => {
    const inputName = (req.body.product || '').trim();
    const quantity = req.body.quantity;
    const actualKey = findActualProductKey(inputName); //
    if (!actualKey) {
        return res.status(404).json({ success: false, message: 'Product not found' });
    }
    const stockData = readStock();
    const available = stockData[actualKey].purchased - stockData[actualKey].consumption;
    if (available < quantity) {
        return res.status(400).json({ success: false, message: "Not enough stock" });
    }
    stockData[actualKey].consumption += quantity;
    stockData[actualKey].stock = stockData[actualKey].purchased - stockData[actualKey].consumption;
    writeStock(stockData);
    appendHistory({
        type: 'OUT',
        product: actualKey,
        quantity,
        date: new Date().toISOString()
    });
    res.json({ success: true, message: `Stock OUT updated for ${actualKey}` });
});
router.post('/stock/addProduct', (req, res) => {
    const name = (req.body.name || '').trim();
    const quantity = req.body.quantity;
    const data = readStock();
    const exists = Object.keys(data).some(p => p.toLowerCase() === name.toLowerCase()); //
    if (exists) return res.status(400).json({ error: 'Product already exists' });
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
    const inputName = decodeURIComponent(req.params.product).trim();
    const actualKey = findActualProductKey(inputName);
    const { fromDate, toDate } = req.query;

    try {
        if (!actualKey) {
            return res.status(404).json({ error: 'Product not found' });
        }

        let history = readHistory().filter(entry => entry.product.toLowerCase() === actualKey.toLowerCase());
        const stockData = readStock();

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

        let runningPurchased = 0;
        let runningConsumption = 0;

        history.forEach(entry => {
            const { quantity, type, date } = entry;

            if (type === 'IN') {
                runningPurchased += quantity;
            } else if (type === 'OUT') {
                runningConsumption += quantity;
            }

            const remaining = runningPurchased - runningConsumption;

            const productMeta = stockData[actualKey];
            const volumePerUnit = productMeta.volumePerUnit || 0;
            const density = productMeta.density || null;

            const totalVolume = volumePerUnit > 0 ? remaining * volumePerUnit : null;
            const totalWeight = density && totalVolume ? (totalVolume * density).toFixed(2) : null;

            let volumeNote = '';
            if (totalVolume) {
                volumeNote = ` (${totalVolume} ml`;
                if (totalWeight) {
                    volumeNote += `, ${totalWeight} g`;
                }
                volumeNote += `)`;
            }
          
            const inQty = type === 'IN' ? quantity : '';
            const outQty = type === 'OUT' ? quantity : '';

            const row = [
                pad(capitalize(actualKey), colWidths[0]), //  capitalized for display
                pad(new Date(date).toLocaleString(), colWidths[1]),
                pad(inQty, colWidths[2]),
                pad(outQty, colWidths[3]),
                pad(`${remaining}${volumeNote}`, colWidths[4])
            ];
            output += '|' + row.join('|') + '|\n';
        });

        const filename = `Stock_Report_${actualKey}_${new Date().toISOString().split('T')[0]}.txt`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'text/plain');
        res.send(output);
    } catch (error) {
        console.error('Error in /stock/report/download/:product', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
module.exports = router;