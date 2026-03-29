// index.js
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser, getContentType } = require('@adiwajshing/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const { readDB, writeDB } = require('./utils/db-utils');
const { isAdmin, isOwner } = require('./utils/baileys-utils');

// Charger les commandes
const generalCommands = require('./commands/general');
const adminCommands = require('./commands/admin');
const banhammerCommands = require('./commands/banhammer');

const allCommands = {
    general: generalCommands,
    admin: adminCommands,
    banhammer: banhammerCommands,
};

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionName);
    const { version, is => isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using Baileys version: ${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ['Atsushi-Bot', 'Chrome', '1.0'],
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            qrcode.generate(qr, { small: true });
            console.log('Scan this QR code with WhatsApp on your phone.');
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            // reconnect if not logged out
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('Opened connection');
            // Initialisation de l'owner si la DB est vide
            const db = readDB();
            if (db.admins.length === 0 && config.ownerNumber) {
                db.admins.push(config.ownerNumber);
                writeDB(db);
                console.log(`Owner ${config.ownerNumber} ajouté comme premier administrateur.`);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || from; // Pour les groupes, participant est le sender
        const isGroup = from.endsWith('@g.us');

        const messageType = getContentType(msg.message);
        const text = msg.message.conversation || msg.message[messageType]?.caption || msg.message[messageType]?.text || '';

        // Mettre à jour la dernière activité de la victime si elle est sous surveillance
        const db = readDB();
        const target = db.banhammerTargets.find(t => t.jid === sender);
        if (target) {
            target.lastActivity = Date.now();
            writeDB(db);
        }

        // Vérifier le préfixe
        if (!text.startsWith(config.prefix)) return;

        const args = text.slice(config.prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        console.log(`Commande reçue: ${commandName} de ${sender}`);

        // Trouver et exécuter la commande
        for (const category of Object.values(allCommands)) {
            const command = category.commands.find(cmd => cmd.name === commandName);
            if (command) {
                // Vérifier les permissions pour les commandes admin et banhammer
                if (category.name === 'Admin Commands' || category.name === 'BanHammer Commands') {
                    if (!isAdmin(sender, db.admins) && !isOwner(sender, config.ownerNumber)) {
                        await sock.sendMessage(from, { text: 'Vous n\'avez pas les permissions pour utiliser cette commande.' });
                        return;
                    }
                }
                try {
                    await command.execute(sock, msg, args, config, allCommands);
                } catch (error) {
                    console.error(`Erreur lors de l'exécution de la commande ${commandName}:`, error);
                    await sock.sendMessage(from, { text: `Une erreur est survenue lors de l'exécution de la commande: ${error.message}` });
                }
                return;
            }
        }
    });

    // --- Logique de détection d'inactivité et déclenchement automatique du BanHammer ---
    setInterval(() => {
        const db = readDB();
        const now = Date.now();
        db.banhammerTargets.forEach(async (target) => {
            if (target.delayHours > 0 && target.status === 'pending') {
                const inactivityDuration = now - target.lastActivity;
                const requiredInactivity = target.delayHours * 60 * 60 * 1000; // heures en ms

                if (inactivityDuration >= requiredInactivity) {
                    console.log(`Déclenchement automatique du BanHammer pour ${target.jid.split('@')[0]} après ${target.delayHours} heures d'inactivité.`);
                    target.status = 'active'; // Marquer comme actif pour éviter des déclenchements multiples
                    writeDB(db); // Sauvegarder l'état

                    // Simuler l'envoi aux contacts (comme dans la commande banhammer_trigger)
                    // En production, tu devrais avoir une logique pour obtenir les contacts réels.
                    const simulatedContacts = [config.ownerNumber + '@s.whatsapp.net']; // Envoyer à l'owner pour le test

                    for (const contactJid of simulatedContacts) {
                        const messageToSend = target.customMessage || `Attention! L'utilisateur ${target.jid.split('@')[0]} est impliqué dans une affaire de ${target.reason}. Voici les preuves: ${target.proofContent}`;
                        await sock.sendMessage(contactJid, { text: messageToSend });
                        console.log(`Message BanHammer automatique envoyé à ${contactJid}`);
                    }
                    target.status = 'completed'; // Marquer comme terminé
                    writeDB(db); // Sauvegarder l'état final
                }
            }
        });
    }, 60 * 60 * 1000); // Vérifie toutes les heures
}

connectToWhatsApp();
