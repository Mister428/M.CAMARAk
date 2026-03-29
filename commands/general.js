// commands/general.js
const { sendMessage, sendSticker } = require('../utils/baileys-utils');
const { getContentType } = require('@adiwajshing/baileys');

module.exports = {
    name: 'General Commands',
    commands: [
        {
            name: 'ping',
            description: 'Vérifie la réactivité du bot.',
            async execute(sock, message, args, config) {
                await sendMessage(sock, message.key.remoteJid, 'Pong!');
            }
        },
        {
            name: 'aide',
            description: 'Affiche la liste des commandes.',
            async execute(sock, message, args, config, commands) {
                let helpText = `*${config.botName} - Commandes disponibles:*\n\n`;
                for (const category of Object.values(commands)) {
                    helpText += `*${category.name}:*\n`;
                    for (const cmd of category.commands) {
                        helpText += `  \`${config.prefix}${cmd.name}\` - ${cmd.description}\n`;
                    }
                    helpText += '\n';
                }
                await sendMessage(sock, message.key.remoteJid, helpText);
            }
        },
        {
            name: 'info',
            description: 'Donne des informations sur le bot.',
            async execute(sock, message, args, config) {
                const infoText = `*${config.botName}*\nVersion: 1.0.0\nCréé par: Brad Society\nPrefix: \`${config.prefix}\``;
                await sendMessage(sock, message.key.remoteJid, infoText);
            }
        },
        {
            name: 'sticker',
            description: 'Crée un sticker à partir d\'une image ou vidéo (répondez à un média).',
            async execute(sock, message, args, config) {
                const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (!quotedMessage) {
                    return sendMessage(sock, message.key.remoteJid, 'Veuillez répondre à une image ou une vidéo pour créer un sticker.');
                }

                const mediaType = getContentType(quotedMessage);
                let mediaBuffer;

                if (mediaType === 'imageMessage' || mediaType === 'videoMessage') {
                    mediaBuffer = await sock.downloadMediaMessage(quotedMessage);
                    await sendSticker(sock, message.key.remoteJid, mediaBuffer);
                } else {
                    await sendMessage(sock, message.key.remoteJid, 'Seules les images et les vidéos peuvent être converties en stickers.');
                }
            }
        },
        // {
        //     name: 'texte',
        //     description: 'Convertit le texte en image (nécessite une lib comme Jimp ou Sharp).',
        //     async execute(sock, message, args, config) {
        //         // Implémentation complexe, nécessite Jimp/Sharp
        //         await sendMessage(sock, message.key.remoteJid, 'Cette commande est en cours de développement.');
        //     }
        // }
    ]
};
