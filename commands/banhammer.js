// commands/banhammer.js
const { sendMessage, isAdmin, isOwner, getGroupParticipants } = require('../utils/baileys-utils');
const { readDB, writeDB } = require('../utils/db-utils');
const { jidNormalizedUser } = require('@adiwajshing/baileys');

module.exports = {
    name: 'BanHammer Commands',
    commands: [
        {
            name: 'banhammer_add',
            description: 'Ajoute une victime à la liste de surveillance du BanHammer. Usage: !banhammer_add <numéro> <raison> <type_preuve> <contenu_preuve> [groupId]',
            async execute(sock, message, args, config) {
                if (!isAdmin(message.key.participant || message.key.remoteJid, readDB().admins) && !isOwner(message.key.participant || message.key.remoteJid, config.ownerNumber)) {
                    return sendMessage(sock, message.key.remoteJid, 'Vous n\'avez pas les permissions pour cette commande.');
                }

                if (args.length < 4) {
                    return sendMessage(sock, message.key.remoteJid, 'Usage: `!banhammer_add <numéro> <raison> <type_preuve> <contenu_preuve> [groupId]`');
                }

                const victimNumber = args[0].replace(/\D/g, ''); // Nettoie le numéro
                const victimJid = victimNumber + '@s.whatsapp.net';
                const reason = args[1];
                const proofType = args[2];
                const proofContent = args.slice(3, args.length - (args[args.length - 1].includes('@g.us') ? 1 : 0)).join(' ');
                const groupId = args[args.length - 1].includes('@g.us') ? args[args.length - 1] : null; // Optionnel: JID du groupe cible

                const db = readDB();
                if (db.banhammerTargets.some(target => target.jid === victimJid)) {
                    return sendMessage(sock, message.key.remoteJid, `La victime ${victimNumber} est déjà sous surveillance.`);
                }

                db.banhammerTargets.push({
                    jid: victimJid,
                    reason: reason,
                    proofType: proofType,
                    proofContent: proofContent,
                    groupId: groupId, // Le groupe où le tagall sera fait
                    status: 'pending', // pending, active, completed, failed
                    delayHours: 0, // Délai avant déclenchement automatique
                    customMessage: `Attention! L'utilisateur ${victimNumber} est impliqué dans une affaire de ${reason}. Voici les preuves: ${proofContent}`,
                    lastActivity: Date.now(), // Pour la détection d'inactivité
                    sessionName: message.sessionName // Associer la cible à la session qui l'a ajoutée ou qui la surveille
                });
                writeDB(db);
                await sendMessage(sock, message.key.remoteJid, `Victime ${victimNumber} ajoutée au BanHammer (Session: ${message.sessionName}, Groupe cible: ${groupId || 'aucun'}).`);
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
                                `   Groupe cible: ${target.groupId ? target.groupId.split('@')[0] : 'N/A'}\n` +
                                `   Session: ${target.sessionName}\n` +
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
            description: 'Déclenche l\'opération BanHammer pour une victime. Usage: !banhammer_trigger <numéro> <groupId> [list_contacts_prives_a_mentionner_et_mp]',
            async execute(sock, message, args, config) {
                if (!isAdmin(message.key.participant || message.key.remoteJid, readDB().admins) && !isOwner(message.key.participant || message.key.remoteJid, config.ownerNumber)) {
                    return sendMessage(sock, message.key.remoteJid, 'Vous n\'avez pas les permissions pour cette commande.');
                }

                if (args.length < 2) {
                    return sendMessage(sock, message.key.remoteJid, 'Usage: `!banhammer_trigger <numéro> <groupId> [list_contacts_prives_a_mentionner_et_mp (séparés par des virgules)]`');
                }

                const victimNumber = args[0].replace(/\D/g, '');
                const victimJid = victimNumber + '@s.whatsapp.net';
                const groupId = args[1]; // Le groupe où faire le tagall
                const privateMessageTargets = args.length > 2 ? args[2].split(',').map(num => num.trim().replace(/\D/g, '') + '@s.whatsapp.net') : [];

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
                await sendMessage(sock, message.key.remoteJid, `Déclenchement du BanHammer pour ${victimNumber} dans le groupe ${groupId.split('@')[0]}...`);

                // 1. Récupérer tous les participants du groupe
                const groupParticipants = await getGroupParticipants(sock, groupId);
                if (groupParticipants.length === 0) {
                    await sendMessage(sock, message.key.remoteJid, `Impossible de récupérer les participants du groupe ${groupId.split('@')[0]}.`);
                    target.status = 'failed';
                    writeDB(db);
                    return;
                }

                // 2. Préparer le message de tagall
                let tagallMessage = `*ATTENTION!* L'utilisateur @${victimNumber} est accusé de *${target.reason}*.\n\n`;
                tagallMessage += `Voici la preuve : ${target.proofContent}\n\n`;
                tagallMessage += `Merci de prendre les mesures nécessaires.`;

                // 3. Envoyer le tagall
                await sendMessage(sock, groupId, tagallMessage, groupParticipants);
                await sendMessage(sock, message.key.remoteJid, `Message de tagall envoyé dans le groupe ${groupId.split('@')[0]}.`);

                // 4. Envoyer des messages privés aux cibles spécifiques
                if (privateMessageTargets.length > 0) {
                    await sendMessage(sock, message.key.remoteJid, `Envoi de messages privés à ${privateMessageTargets.length} contacts...`);
                    for (const pmTargetJid of privateMessageTargets) {
                        const pmMessage = `*Alerte Privée :* Concernant l'utilisateur @${victimNumber} (${victimJid.split('@')[0]}), les accusations de *${target.reason}* sont sérieuses.\n\nPreuve : ${target.proofContent}\n\nAgissez discrètement.`;
                        await sendMessage(sock, pmTargetJid, pmMessage, [victimJid]); // Mentionner la victime dans le MP aussi
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Délai pour éviter le flood
                    }
                    await sendMessage(sock, message.key.remoteJid, `Messages privés envoyés aux cibles spécifiées.`);
                } else {
                    await sendMessage(sock, message.key.remoteJid, `Aucune cible de message privé spécifiée.`);
                }

                target.status = 'completed';
                writeDB(db);
                await sendMessage(sock, message.key.remoteJid, `Opération BanHammer pour ${victimNumber} terminée.`);
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
                                   `Groupe cible: ${target.groupId ? target.groupId.split('@')[0] : 'N/A'}\n` +
                                   `Session: ${target.sessionName}\n` +
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
    ]
};
