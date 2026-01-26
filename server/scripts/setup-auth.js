const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const readline = require('readline');

const DATA_DIR = path.resolve(__dirname, '../../data');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

// Ensure data dir
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const args = process.argv.slice(2);

// If password provided as argument, use it (for non-interactive mode)
if (args[0]) {
    setupAuth(args[0]);
} else {
    // Interactive mode - ask for password
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log('\n=== PDCP Admin Setup ===\n');
    console.log('Create admin credentials for the control panel.\n');
    
    rl.question('Enter admin password (min 8 characters): ', (password) => {
        if (!password || password.length < 8) {
            console.error('Error: Password must be at least 8 characters');
            process.exit(1);
        }
        
        rl.question('Confirm password: ', (confirm) => {
            rl.close();
            
            if (password !== confirm) {
                console.error('Error: Passwords do not match');
                process.exit(1);
            }
            
            setupAuth(password);
        });
    });
}

function setupAuth(password) {
    console.log('\nSetting up authentication...');

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

    console.log(`\n✓ Auth configured successfully`);
    console.log(`  Location: ${AUTH_FILE}`);
    console.log(`  Username: admin`);
    console.log(`  Password: ${password.replace(/./g, '*')}`);
    console.log('\nIMPORTANT: Save these credentials securely!\n');
}
