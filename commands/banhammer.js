// commands/banhammer.js
const { sendMessage, isAdmin, isOwner } = require('../utils/baileys-utils');
const { readDB, writeDB } = require('../utils/db-utils');
const { jidNormalizedUser } = require('@adiwajshing/baileys');

module.exports = {
    name: 'BanHammer Commands',
    commands: [
        {
            name: 'banhammer_add',
            description: 'Ajoute une victime à la liste de surveillance du BanHammer. Usage: !banhammer_add <numéro> <raison> <type_preuve> <contenu_preuve>',
            async execute(sock, message, args, config) {
                if (!isAdmin(message.key.participant || message.key.remoteJid, readDB().admins) && !isOwner(message.key.participant || message.key.remoteJid, config.ownerNumber)) {
                    return sendMessage(sock, message.key.remoteJid, 'Vous n\'avez pas les permissions pour cette commande.');
                }

                if (args.length < 4) {
                    return sendMessage(sock, message.key.remoteJid, 'Usage: `!banhammer_add <numéro> <raison> <type_preuve> <contenu_preuve>`');
                }

                const victimNumber = args[0].replace(/\D/g, ''); // Nettoie le numéro
                const victimJid = victimNumber + '@s.whatsapp.net';
                const reason = args[1];
                const proofType = args[2];
                const proofContent = args.slice(3).join(' ');

                const db = readDB();
                if (db.banhammerTargets.some(target => target.jid === victimJid)) {
                    return sendMessage(sock, message.key.remoteJid, `La victime ${victimNumber} est déjà sous surveillance.`);
                }

                db.banhammerTargets.push({
                    jid: victimJid,
                    reason: reason,
                    proofType: proofType,
                    proofContent: proofContent,
                    status: 'pending', // pending, active, completed, failed
                    contacts: [], // Potentiellement rempli plus tard
                    delayHours: 0, // Délai avant déclenchement automatique
                    customMessage: `Attention! L'utilisateur ${victimNumber} est impliqué dans une affaire de ${reason}. Voici les preuves: ${proofContent}`,
                    lastActivity: Date.now() // Pour la détection d'inactivité
                });
                writeDB(db);
                await sendMessage(sock, message.key.remoteJid, `Victime ${victimNumber} ajoutée au BanHammer avec la raison "${reason}".`);
            }
        },
        {
            name: 'banhammer_list',
            description: 'Affiche la liste des victimes sous surveillance du BanHammer.',
            async execute(sock, message, args, config) {
                if (!isAdmin(message.key.participant || message.key.remoteJid, readDB().admins) && !isOwner(message.key.participant || message.key.remoteJid, config.ownerNumber)) {
                    return sendMessage(sock, message.key.remoteJid, 'Vous n\'avez pas les permissions pour cette commande.');
                }

                const db = readDB();
                if (db.banhammerTargets.length === 0) {
                    return sendMessage(sock, message.key.remoteJid, 'Aucune victime sous surveillance du BanHammer.');
                }

                let listText = '*Victimes BanHammer:*\n\n';
                db.banhammerTargets.forEach((target, index) => {
                    listText += `${index + 1}. Numéro: ${target.jid.split('@')[0]}\n` +
                                `   Raison: ${target.reason}\n` +
                                `   Statut: ${target.status}\n` +
                                `   Preuve: ${target.proofType} - ${target.proofContent.substring(0, 50)}...\n\n`;
                });
                await sendMessage(sock, message.key.remoteJid, listText);
            }
        },
        {
            name: 'banhammer_remove',
            description: 'Supprime une victime de la liste de surveillance. Usage: !banhammer_remove <numéro>',
            async execute(sock, message, args, config) {
                if (!isAdmin(message.key.participant || message.key.remoteJid, readDB().admins) && !isOwner(message.key.participant || message.key.remoteJid, config.ownerNumber)) {
                    return sendMessage(sock, message.key.remoteJid, 'Vous n\'avez pas les permissions pour cette commande.');
                }

                if (args.length < 1) {
                    return sendMessage(sock, message.key.remoteJid, 'Usage: `!banhammer_remove <numéro>`');
                }

                const victimNumber = args[0].replace(/\D/g, '');
                const victimJid = victimNumber + '@s.whatsapp.net';

                const db = readDB();
                const initialLength = db.banhammerTargets.length;
                db.banhammerTargets = db.banhammerTargets.filter(target => target.jid !== victimJid);

                if (db.banhammerTargets.length < initialLength) {
                    writeDB(db);
                    await sendMessage(sock, message.key.remoteJid, `Victime ${victimNumber} supprimée du BanHammer.`);
                } else {
                    await sendMessage(sock, message.key.remoteJid, `Victime ${victimNumber} non trouvée dans la liste du BanHammer.`);
                }
            }
        },
        {
            name: 'banhammer_trigger',
            description: 'Déclenche l\'opération BanHammer pour une victime. Usage: !banhammer_trigger <numéro> [mode]',
            async execute(sock, message, args, config) {
                if (!isAdmin(message.key.participant || message.key.remoteJid, readDB().admins) && !isOwner(message.key.participant || message.key.remoteJid, config.ownerNumber)) {
                    return sendMessage(sock, message.key.remoteJid, 'Vous n\'avez pas les permissions pour cette commande.');
                }

                if (args.length < 1) {
                    return sendMessage(sock, message.key.remoteJid, 'Usage: `!banhammer_trigger <numéro> [mode]`');
                }

                const victimNumber = args[0].replace(/\D/g, '');
                const victimJid = victimNumber + '@s.whatsapp.net';
                const mode = args[1] || 'all'; // 'all', 'group:<name>', 'list:<num1,num2>'

                const db = readDB();
                const target = db.banhammerTargets.find(t => t.jid === victimJid);

                if (!target) {
                    return sendMessage(sock, message.key.remoteJid, `Victime ${victimNumber} non trouvée dans la liste du BanHammer.`);
                }

                if (target.status === 'active') {
                    return sendMessage(sock, message.key.remoteJid, `L'opération BanHammer pour ${victimNumber} est déjà active.`);
                }

                // --- Logique de déclenchement BanHammer ---
                target.status = 'active';
                writeDB(db);
                await sendMessage(sock, message.key.remoteJid, `Déclenchement du BanHammer pour ${victimNumber} en mode "${mode}"...`);

                // Ici, tu devrais implémenter la logique d'envoi aux contacts.
                // Cela est TRÈS complexe car WhatsApp ne fournit pas d'API pour obtenir les contacts d'un utilisateur arbitraire.
                // Tu devrais avoir une liste de contacts pré-existante ou des contacts du bot qui sont aussi contacts de la victime.

                // Pour cet exemple, nous allons simuler l'envoi à l'opérateur du bot.
                const simulatedContacts = [message.key.remoteJid]; // Envoie à l'admin pour le test

                for (const contactJid of simulatedContacts) {
                    const messageToSend = target.customMessage || `Attention! L'utilisateur ${victimNumber} est impliqué dans une affaire de ${target.reason}. Voici les preuves: ${target.proofContent}`;
                    await sendMessage(sock, contactJid, messageToSend);
                    // Si proofType est 'image', tu pourrais envoyer l'image ici
                    // if (target.proofType === 'image') {
                    //     await sendImage(sock, contactJid, target.proofContent, 'Preuve');
                    // }
                    console.log(`Message BanHammer envoyé à ${contactJid}`);
                }

                target.status = 'completed';
                writeDB(db);
                await sendMessage(sock, message.key.remoteJid, `Opération BanHammer pour ${victimNumber} terminée (simulée).`);
            }
        },
        {
            name: 'banhammer_status',
            description: 'Affiche le statut de l\'opération BanHammer pour une victime. Usage: !banhammer_status <numéro>',
            async execute(sock, message, args, config) {
                if (!isAdmin(message.key.participant || message.key.remoteJid, readDB().admins) && !isOwner(message.key.participant || message.key.remoteJid, config.ownerNumber)) {
                    return sendMessage(sock, message.key.remoteJid, 'Vous n\'avez pas les permissions pour cette commande.');
                }

                if (args.length < 1) {
                    return sendMessage(sock, message.key.remoteJid, 'Usage: `!banhammer_status <numéro>`');
                }

                const victimNumber = args[0].replace(/\D/g, '');
                const victimJid = victimNumber + '@s.whatsapp.net';

                const db = readDB();
                const target = db.banhammerTargets.find(t => t.jid === victimJid);

                if (!target) {
                    return sendMessage(sock, message.key.remoteJid, `Victime ${victimNumber} non trouvée dans la liste du BanHammer.`);
                }

                const statusText = `*Statut BanHammer pour ${victimNumber}:*\n` +
                                   `Raison: ${target.reason}\n` +
                                   `Statut: ${target.status}\n` +
                                   `Dernière activité: ${new Date(target.lastActivity).toLocaleString()}\n` +
                                   `Délai d'inactivité: ${target.delayHours} heures\n`;
                await sendMessage(sock, message.key.remoteJid, statusText);
            }
        },
        {
            name: 'banhammer_delay',
            description: 'Définit le délai d\'inactivité avant déclenchement automatique (en heures). Usage: !banhammer_delay <numéro> <heures>',
            async execute(sock, message, args, config) {
                if (!isAdmin(message.key.participant || message.key.remoteJid, readDB().admins) && !isOwner(message.key.participant || message.key.remoteJid, config.ownerNumber)) {
                    return sendMessage(sock, message.key.remoteJid, 'Vous n\'avez pas les permissions pour cette commande.');
                }

                if (args.length < 2) {
                    return sendMessage(sock, message.key.remoteJid, 'Usage: `!banhammer_delay <numéro> <heures>`');
                }

                const victimNumber = args[0].replace(/\D/g, '');
                const victimJid = victimNumber + '@s.whatsapp.net';
                const delayHours = parseInt(args[1], 10);

                if (isNaN(delayHours) || delayHours < 0) {
                    return sendMessage(sock, message.key.remoteJid, 'Veuillez fournir un nombre d\'heures valide.');
                }

                const db = readDB();
                const target = db.banhammerTargets.find(t => t.jid === victimJid);

                if (!target) {
                    return sendMessage(sock, message.key.remoteJid, `Victime ${victimNumber} non trouvée dans la liste du BanHammer.`);
                }

                target.delayHours = delayHours;
                writeDB(db);
                await sendMessage(sock, message.key.remoteJid, `Délai d'inactivité pour ${victimNumber} défini à ${delayHours} heures.`);
            }
        },
        {
            name: 'banhammer_message',
            description: 'Personnalise le message de signalement. Usage: !banhammer_message <numéro> <nouveau_message>',
            async execute(sock, message, args, config) {
                if (!isAdmin(message.key.participant || message.key.remoteJid, readDB().admins) && !isOwner(message.key.participant || message.key.remoteJid, config.ownerNumber)) {
                    return sendMessage(sock, message.key.remoteJid, 'Vous n\'avez pas les permissions pour cette commande.');
                }

                if (args.length < 2) {
                    return sendMessage(sock, message.key.remoteJid, 'Usage: `!banhammer_message <numéro> <nouveau_message>`');
                }

                const victimNumber = args[0].replace(/\D/g, '');
                const victimJid = victimNumber + '@s.whatsapp.net';
                const newMessage = args.slice(1).join(' ');

                const db = readDB();
                const target = db.banhammerTargets.find(t => t.jid === victimJid);

                if (!target) {
                    return sendMessage(sock, message.key.remoteJid, `Victime ${victimNumber} non trouvée dans la liste du BanHammer.`);
                }

                target.customMessage = newMessage;
                writeDB(db);
                await sendMessage(sock, message.key.remoteJid, `Message personnalisé pour ${victimNumber} mis à jour.`);
            }
        },
        // Note: banhammer_contacts est complexe. WhatsApp ne permet pas de récupérer les contacts d'un tiers.
        // Cela nécessiterait des techniques d'ingénierie sociale ou des exploits non liés à l'API Baileys standard.
        // Pour une implémentation réaliste, tu devrais avoir une liste de contacts à cibler que tu aurais obtenue par d'autres moyens.
    ]
};
