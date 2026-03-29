// commands/admin.js
const { sendMessage, isAdmin, isOwner } = require('../utils/baileys-utils');
const { readDB, writeDB } = require('../utils/db-utils');
const { jidNormalizedUser } = require('@adiwajshing/baileys');

module.exports = {
    name: 'Admin Commands',
    commands: [
        {
            name: 'addadmin',
            description: 'Ajoute un utilisateur à la liste des administrateurs (propriétaire uniquement).',
            async execute(sock, message, args, config) {
                if (!isOwner(message.key.participant || message.key.remoteJid, config.ownerNumber)) {
                    return sendMessage(sock, message.key.remoteJid, 'Seul le propriétaire peut utiliser cette commande.');
                }

                const db = readDB();
                let targetJid = args[0];

                if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
                    targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
                } else if (!targetJid || !targetJid.includes('@s.whatsapp.net')) {
                    return sendMessage(sock, message.key.remoteJid, 'Veuillez mentionner un utilisateur ou fournir son numéro (ex: `!addadmin 2250700000000`).');
                }

                const normalizedTarget = jidNormalizedUser(targetJid).split('@')[0];

                if (!db.admins.includes(normalizedTarget)) {
                    db.admins.push(normalizedTarget);
                    writeDB(db);
                    await sendMessage(sock, message.key.remoteJid, `L'utilisateur ${normalizedTarget} a été ajouté aux administrateurs.`);
                } else {
                    await sendMessage(sock, message.key.remoteJid, `L'utilisateur ${normalizedTarget} est déjà administrateur.`);
                }
            }
        },
        {
            name: 'deladmin',
            description: 'Supprime un utilisateur de la liste des administrateurs (propriétaire uniquement).',
            async execute(sock, message, args, config) {
                if (!isOwner(message.key.participant || message.key.remoteJid, config.ownerNumber)) {
                    return sendMessage(sock, message.key.remoteJid, 'Seul le propriétaire peut utiliser cette commande.');
                }

                const db = readDB();
                let targetJid = args[0];

                if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
                    targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
                } else if (!targetJid || !targetJid.includes('@s.whatsapp.net')) {
                    return sendMessage(sock, message.key.remoteJid, 'Veuillez mentionner un utilisateur ou fournir son numéro.');
                }

                const normalizedTarget = jidNormalizedUser(targetJid).split('@')[0];
                const index = db.admins.indexOf(normalizedTarget);

                if (index > -1) {
                    db.admins.splice(index, 1);
                    writeDB(db);
                    await sendMessage(sock, message.key.remoteJid, `L'utilisateur ${normalizedTarget} a été supprimé des administrateurs.`);
                } else {
                    await sendMessage(sock, message.key.remoteJid, `L'utilisateur ${normalizedTarget} n'est pas administrateur.`);
                }
            }
        },
        {
            name: 'broadcast',
            description: 'Envoie un message à tous les utilisateurs connus du bot.',
            async execute(sock, message, args, config) {
                if (!isAdmin(message.key.participant || message.key.remoteJid, readDB().admins) && !isOwner(message.key.participant || message.key.remoteJid, config.ownerNumber)) {
                    return sendMessage(sock, message.key.remoteJid, 'Vous n\'avez pas les permissions pour cette commande.');
                }

                const broadcastMessage = args.join(' ');
                if (!broadcastMessage) {
                    return sendMessage(sock, message.key.remoteJid, 'Veuillez fournir le message à diffuser.');
                }

                // Cette implémentation est simpliste. Pour un vrai broadcast, il faudrait
                // stocker tous les JIDs avec lesquels le bot a interagi.
                // Pour l'exemple, on va juste envoyer à l'admin qui a lancé la commande.
                // Une implémentation réelle nécessiterait une DB plus complexe pour stocker les JIDs.
                await sendMessage(sock, message.key.remoteJid, `[BROADCAST TEST] : ${broadcastMessage}`);
                await sendMessage(sock, message.key.remoteJid, 'La fonction de broadcast réelle nécessiterait une liste de tous les JIDs connus.');
            }
        },
        {
            name: 'status',
            description: 'Affiche l\'état du bot.',
            async execute(sock, message, args, config) {
                if (!isAdmin(message.key.participant || message.key.remoteJid, readDB().admins) && !isOwner(message.key.participant || message.key.remoteJid, config.ownerNumber)) {
                    return sendMessage(sock, message.key.remoteJid, 'Vous n\'avez pas les permissions pour cette commande.');
                }
                const db = readDB();
                const statusText = `*Statut du ${config.botName}:*\n` +
                                   `Connecté: ${sock.user ? 'Oui' : 'Non'}\n` +
                                   `Administrateurs: ${db.admins.length > 0 ? db.admins.join(', ') : 'Aucun'}\n` +
                                   `Cibles BanHammer: ${db.banhammerTargets.length}\n`;
                await sendMessage(sock, message.key.remoteJid, statusText);
            }
        },
        {
            name: 'setprefix',
            description: 'Change le préfixe des commandes (propriétaire uniquement).',
            async execute(sock, message, args, config) {
                if (!isOwner(message.key.participant || message.key.remoteJid, config.ownerNumber)) {
                    return sendMessage(sock, message.key.remoteJid, 'Seul le propriétaire peut utiliser cette commande.');
                }
                const newPrefix = args[0];
                if (!newPrefix) {
                    return sendMessage(sock, message.key.remoteJid, 'Veuillez spécifier un nouveau préfixe.');
                }
                config.prefix = newPrefix; // Met à jour la config en mémoire
                // Pour persister, il faudrait réécrire config.js ou utiliser une DB pour la config
                await sendMessage(sock, message.key.remoteJid, `Le préfixe a été changé pour \`${newPrefix}\`.`);
            }
        }
    ]
};
