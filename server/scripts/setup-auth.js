const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const DATA_DIR = path.resolve(__dirname, '../../data');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

// Ensure data dir
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const args = process.argv.slice(2);
const password = args[0] || 'admin123';

console.log(`Setting up authentication...`);

const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(password, salt);
const jwtSecret = crypto.randomBytes(32).toString('hex');

const config = {
    username: 'admin',
    passwordHash: hash,
    jwtSecret: jwtSecret,
    createdAt: new Date().toISOString()
};

fs.writeFileSync(AUTH_FILE, JSON.stringify(config, null, 2));

console.log(`Auth config written to ${AUTH_FILE}`);
console.log(`Username: admin`);
console.log(`Password: ${password}`);
