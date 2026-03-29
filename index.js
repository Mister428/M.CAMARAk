// index.js
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser, getContentType } = require('@adiwajshing/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const config = require('./config');
const { readDB, writeDB } = require('./utils/db-utils');
const { isAdmin, isOwner, sendMessage, getGroupParticipants } = require('./utils/baileys-utils');

// Charger les commandes
const generalCommands = require('./commands/general');
const adminCommands = require('./commands/admin');
const banhammerCommands = require('./commands/banhammer');

const allCommands = {
    general: generalCommands,
    admin: adminCommands,
    banhammer: banhammerCommands,
};

// --- Initialisation du serveur Express ---
const app = express();
const API_PORT = config.apiPort;

app.use(cors());
app.use(bodyParser.json());

// Middleware d'authentification simple
const authenticateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey && apiKey === config.apiKey) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
    }
};

app.use(authenticateApiKey);

// Global map pour stocker les sockets pour chaque session
const sessions = new Map(); // Map<sessionName, sock>

// Endpoint pour obtenir l'état de toutes les sessions
app.get('/api/status', (req, res) => {
    const db = readDB();
    const sessionStatuses = {};
    config.sessionNames.forEach(sessionName => {
        const sock = sessions.get(sessionName);
        sessionStatuses[sessionName] = {
            connected: sock && sock.user ? true : false,
            userJid: sock && sock.user ? sock.user.id : null,
            status: sock && sock.user ? 'Connected' : 'Disconnected',
        };
    });

    res.json({
        botName: config.botName,
        owner: config.ownerNumber,
        admins: db.admins,
        banhammerTargetsCount: db.banhammerTargets.length,
        sessions: sessionStatuses,
    });
});

// Endpoint pour obtenir la liste des cibles BanHammer
app.get('/api/banhammer/targets', (req, res) => {
    const db = readDB();
    res.json(db.banhammerTargets);
});

// Endpoint pour ajouter une cible BanHammer
app.post('/api/banhammer/add', (req, res) => {
    const { victimNumber, reason, proofType, proofContent, groupId, sessionName } = req.body;

    if (!victimNumber || !reason || !proofType || !proofContent || !sessionName) {
        return res.status(400).json({ error: 'Missing parameters: victimNumber, reason, proofType, proofContent, sessionName are required.' });
    }
    if (!config.sessionNames.includes(sessionName)) {
        return res.status(400).json({ error: `Invalid sessionName: ${sessionName}. Must be one of ${config.sessionNames.join(', ')}.` });
    }

    const victimJid = victimNumber.replace(/\D/g, '') + '@s.whatsapp.net';
    const db = readDB();

    if (db.banhammerTargets.some(target => target.jid === victimJid)) {
        return res.status(409).json({ error: `Victime ${victimNumber} est déjà sous surveillance.` });
    }

    db.banhammerTargets.push({
        jid: victimJid,
        reason: reason,
        proofType: proofType,
        proofContent: proofContent,
        groupId: groupId || null,
        status: 'pending',
        delayHours: 0,
        customMessage: `Attention! L'utilisateur ${victimNumber} est impliqué dans une affaire de ${reason}. Voici les preuves: ${proofContent}`,
        lastActivity: Date.now(),
        sessionName: sessionName
    });
    writeDB(db);
    res.json({ success: true, message: `Victime ${victimNumber} ajoutée au BanHammer pour la session ${sessionName}.` });
});

// Endpoint pour déclencher le BanHammer
app.post('/api/banhammer/trigger', async (req, res) => {
    const { victimNumber, groupId, privateMessageTargets, sessionName } = req.body;

    if (!victimNumber || !groupId || !sessionName) {
        return res.status(400).json({ error: 'Missing parameters: victimNumber, groupId, sessionName are required.' });
    }
    if (!config.sessionNames.includes(sessionName)) {
        return res.status(400).json({ error: `Invalid sessionName: ${sessionName}. Must be one of ${config.sessionNames.join(', ')}.` });
    }

    const sock = sessions.get(sessionName);
    if (!sock || !sock.user) {
        return res.status(503).json({ error: `Session ${sessionName} is not connected to WhatsApp.` });
    }

    const victimJid = victimNumber.replace(/\D/g, '') + '@s.whatsapp.net';
    const db = readDB();
    const target = db.banhammerTargets.find(t => t.jid === victimJid && t.sessionName === sessionName);

    if (!target) {
        return res.status(404).json({ error: `Victime ${victimNumber} non trouvée dans la liste du BanHammer pour la session ${sessionName}.` });
    }

    if (target.status === 'active') {
        return res.status(409).json({ error: `L'opération BanHammer pour ${victimNumber} est déjà active.` });
    }

    target.status = 'active';
    writeDB(db);

    try {
        // 1. Récupérer tous les participants du groupe
        const groupParticipants = await getGroupParticipants(sock, groupId);
        if (groupParticipants.length === 0) {
            throw new Error(`Impossible de récupérer les participants du groupe ${groupId.split('@')[0]}.`);
        }

        // 2. Préparer le message de tagall
        let tagallMessage = `*ATTENTION!* L'utilisateur @${victimNumber} est accusé de *${target.reason}*.\n\n`;
        tagallMessage += `Voici la preuve : ${target.proofContent}\n\n`;
        tagallMessage += `Merci de prendre les mesures nécessaires.`;

        // 3. Envoyer le tagall
        await sendMessage(sock, groupId, tagallMessage, groupParticipants);
        console.log(`[${sessionName}] Message de tagall envoyé dans le groupe ${groupId.split('@')[0]}.`);

        // 4. Envoyer des messages privés aux cibles spécifiques
        const pmTargets = (privateMessageTargets || []).map(num => num.replace(/\D/g, '') + '@s.whatsapp.net');
        if (pmTargets.length > 0) {
            console.log(`[${sessionName}] Envoi de messages privés à ${pmTargets.length} contacts...`);
            for (const pmTargetJid of pmTargets) {
                const pmMessage = `*Alerte Privée :* Concernant l'utilisateur @${victimNumber} (${victimJid.split('@')[0]}), les accusations de *${target.reason}* sont sérieuses.\n\nPreuve : ${target.proofContent}\n\nAgissez discrètement.`;
                await sendMessage(sock, pmTargetJid, pmMessage, [victimJid]);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Délai pour éviter le flood
            }
            console.log(`[${sessionName}] Messages privés envoyés aux cibles spécifiées.`);
        } else {
            console.log(`[${sessionName}] Aucune cible de message privé spécifiée.`);
        }

        target.status = 'completed';
        writeDB(db);
        res.json({ success: true, message: `Opération BanHammer pour ${victimNumber} terminée pour la session ${sessionName}.` });

    } catch (error) {
        console.error(`[${sessionName}] Erreur lors du déclenchement du BanHammer pour ${victimNumber}:`, error);
        target.status = 'failed';
        writeDB(db);
        res.status(500).json({ error: `Échec de l'opération BanHammer: ${error.message}` });
    }
});


// Démarrer le serveur Express
app.listen(API_PORT, () => {
    console.log(`API Server running on port ${API_PORT}`);
});

// --- Gestion des sessions Baileys ---
async function connectToWhatsApp(sessionName) {
    const { state, saveCreds } = await useMultiFileAuthState(sessionName);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[${sessionName}] Using Baileys version: ${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: [`Atsushi-Bot (${sessionName})`, 'Chrome', '1.0'],
    });

    sessions.set(sessionName, sock); // Stocker le socket dans la map

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log(`[${sessionName}] Scan this QR code for session ${sessionName} with WhatsApp on your phone.`);
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log(`[${sessionName}] Connection closed due to `, lastDisconnect.error, ', reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                setTimeout(() => connectToWhatsApp(sessionName), 5000); // Tente de reconnecter après 5s
            }
        } else if (connection === 'open') {
            console.log(`[${sessionName}] Opened connection for session ${sessionName}`);
            // Initialisation de l'owner si la DB est vide (seulement pour la première session)
            const db = readDB();
            if (db.admins.length === 0 && config.ownerNumber) {
                db.admins.push(config.ownerNumber);
                writeDB(db);
                console.log(`[${sessionName}] Owner ${config.ownerNumber} ajouté comme premier administrateur.`);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || from;
        const isGroup = from.endsWith('@g.us');

        const messageType = getContentType(msg.message);
        const text = msg.message.conversation || msg.message[messageType]?.caption || msg.message[messageType]?.text || '';

        // Mettre à jour la dernière activité de la victime si elle est sous surveillance
        const db = readDB();
        const targetIndex = db.banhammerTargets.findIndex(t => t.jid === sender);
        if (targetIndex !== -1) {
            db.banhammerTargets[targetIndex].lastActivity = Date.now();
            writeDB(db);
        }

        if (!text.startsWith(config.prefix)) return;

        const args = text.slice(config.prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        console.log(`[${sessionName}] Commande reçue: ${commandName} de ${sender}`);

        // Ajouter la sessionName à l'objet message pour que les commandes puissent l'utiliser
        msg.sessionName = sessionName;

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
                    console.error(`[${sessionName}] Erreur lors de l'exécution de la commande ${commandName}:`, error);
                    await sock.sendMessage(from, { text: `Une erreur est survenue lors de l'exécution de la commande: ${error.message}` });
                }
                return;
            }
        }
    });
}

// --- Logique de détection d'inactivité et déclenchement automatique du BanHammer ---
// Cette logique doit maintenant itérer sur toutes les sessions connectées
setInterval(async () => {
    const db = readDB();
    const now = Date.now();
    for (const target of db.banhammerTargets) {
        if (target.delayHours > 0 && target.status === 'pending') {
            const inactivityDuration = now - target.lastActivity;
            const requiredInactivity = target.delayHours * 60 * 60 * 1000; // heures en ms

            if (inactivityDuration >= requiredInactivity) {
                const sock = sessions.get(target.sessionName);
                if (!sock || !sock.user) {
                    console.log(`[${target.sessionName}] Session non connectée pour le déclenchement automatique de ${target.jid.split('@')[0]}.`);
                    continue; // Passer à la cible suivante si la session n'est pas active
                }

                console.log(`[${target.sessionName}] Déclenchement automatique du BanHammer pour ${target.jid.split('@')[0]} après ${target.delayHours} heures d'inactivité.`);
                target.status = 'active';
                writeDB(db);

                try {
                    // 1. Récupérer tous les participants du groupe
                    const groupParticipants = await getGroupParticipants(sock, target.groupId);
                    if (groupParticipants.length === 0) {
                        throw new Error(`Impossible de récupérer les participants du groupe ${target.groupId.split('@')[0]}.`);
                    }

                    // 2. Préparer le message de tagall
                    let tagallMessage = `*ATTENTION!* L'utilisateur @${target.jid.split('@')[0]} est accusé de *${target.reason}*.\n\n`;
                    tagallMessage += `Voici la preuve : ${target.proofContent}\n\n`;
                    tagallMessage += `Merci de prendre les mesures nécessaires.`;

                    // 3. Envoyer le tagall
                    await sendMessage(sock, target.groupId, tagallMessage, groupParticipants);
                    console.log(`[${target.sessionName}] Message de tagall automatique envoyé dans le groupe ${target.groupId.split('@')[0]}.`);

                    // Pas de messages privés automatiques dans cette version simplifiée, mais la logique pourrait être ajoutée ici.

                    target.status = 'completed';
                    writeDB(db);
                    console.log(`[${target.sessionName}] Opération BanHammer automatique pour ${target.jid.split('@')[0]} terminée.`);
                } catch (error) {
                    console.error(`[${target.sessionName}] Erreur lors du déclenchement automatique du BanHammer pour ${target.jid.split('@')[0]}:`, error);
                    target.status = 'failed';
                    writeDB(db);
                }
            }
        }
    }
}, 60 * 60 * 1000); // Vérifie toutes les heures

// Lancer la connexion pour toutes les sessions définies
config.sessionNames.forEach(sessionName => {
    connectToWhatsApp(sessionName);
});
