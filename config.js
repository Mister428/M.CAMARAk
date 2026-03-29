// config.js
module.exports = {
    prefix: '!', // Préfixe des commandes
    ownerNumber: '224612908366', // Ton numéro WhatsApp (sans le + et sans le code pays si Baileys le gère automatiquement, ex: '2250700000000')
    botName: 'Atsushi-Bot',
    sessionNames: ['session1', 'session2'], // <-- NOUVEAU: Noms des dossiers pour chaque session
    dbFile: './db.json', // Fichier pour la base de données simple
    apiPort: process.env.PORT || 3000, // Port pour l'API web
    apiKey: 'YOUR_SUPER_SECRET_API_KEY', // <-- NOUVEAU: Clé API pour le dashboard
};
