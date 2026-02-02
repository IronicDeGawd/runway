#!/usr/bin/env node

/**
 * Interactive setup script for admin authentication
 * Creates initial admin credentials in data/auth.json
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Determine project root (script is in server/scripts, root is ../../)
const projectRoot = path.resolve(__dirname, '../..');
const authFilePath = path.join(projectRoot, 'data', 'auth.json');

console.log('==============================================');
console.log('  Runway Admin Setup');
console.log('==============================================\n');

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function hashPassword(password) {
  // Use bcrypt for password hashing (same as auth.ts)
  return await bcrypt.hash(password, 10);
}

function generateJwtSecret() {
  return crypto.randomBytes(64).toString('hex');
}

async function setup() {
  try {
    // Check if auth.json already exists
    if (fs.existsSync(authFilePath)) {
      const overwrite = await question('Auth file already exists. Overwrite? (y/n): ');
      if (overwrite.toLowerCase() !== 'y') {
        console.log('Setup cancelled.');
        rl.close();
        process.exit(0);
      }
    }

    // Get username
    let username = await question('Enter admin username (default: admin): ');
    username = username.trim() || 'admin';

    // Get password
    let password = await question('Enter admin password: ');
    while (!password || password.length < 6) {
      console.log('Password must be at least 6 characters long.');
      password = await question('Enter admin password: ');
    }

    // Confirm password
    const confirmPassword = await question('Confirm password: ');
    if (password !== confirmPassword) {
      console.log('Passwords do not match. Setup failed.');
      rl.close();
      process.exit(1);
    }

    // Hash password using bcrypt
    const passwordHash = await hashPassword(password);
    
    // Generate JWT secret
    const jwtSecret = generateJwtSecret();

    // Create auth object matching AuthConfig interface
    // mustResetPassword is false since user is setting their own password interactively
    const authData = {
      username: username,
      passwordHash: passwordHash,
      jwtSecret: jwtSecret,
      mustResetPassword: false
    };

    // Ensure data directory exists
    const dataDir = path.dirname(authFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Write auth file
    fs.writeFileSync(authFilePath, JSON.stringify(authData, null, 2));
    console.log(`\n✓ Admin credentials saved to ${authFilePath}`);
    console.log(`✓ Username: ${username}`);
    console.log(`✓ JWT secret generated`);
    console.log('\nSetup complete!');

  } catch (error) {
    console.error('Error during setup:', error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

setup();
