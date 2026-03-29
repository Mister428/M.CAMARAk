// utils/db-utils.js
const fs = require('fs');
const config = require('../config');

const dbPath = config.dbFile;

// Assure que le fichier db.json existe
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ admins: [], banhammerTargets: [] }, null, 2));
}

function readDB() {
    try {
        const data = fs.readFileSync(dbPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Erreur de lecture de la base de données:', error);
        return { admins: [], banhammerTargets: [] };
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('Erreur d\'écriture de la base de données:', error);
    }
}

module.exports = {
    readDB,
    writeDB,
};
