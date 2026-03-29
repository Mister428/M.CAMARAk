// utils/baileys-utils.js
const { jidNormalizedUser, isJidGroup, get  } = require('@adiwajshing/baileys');

/**
 * Envoie un message texte à un JID.
 * @param {import('@adiwajshing/baileys').WASocket} sock
 * @param {string} jid
 * @param {string} text
 * @param {Array<string>} [mentions] - JIDs à mentionner
 */
async function sendMessage(sock, jid, text, mentions = []) {
    await sock.sendMessage(jid, { text: text, mentions: mentions });
}

/**
 * Envoie une image avec caption.
 * @param {import('@adiwajshing/baileys').WASocket} sock
 * @param {string} jid
 * @param {Buffer|string} media
 * @param {string} caption
 */
async function sendImage(sock, jid, media, caption = '') {
    await sock.sendMessage(jid, { image: media, caption: caption });
}

/**
 * Envoie un sticker.
 * @param {import('@adiwajshing/baileys').WASocket} sock
 * @param {string} jid
 * @param {Buffer|string} media
 */
async function sendSticker(sock, jid, media) {
    await sock.sendMessage(jid, { sticker: media });
}

/**
 * Vérifie si un JID est administrateur.
 * @param {string} jid
 * @param {Array<string>} admins
 * @returns {boolean}
 */
function isAdmin(jid, admins) {
    const normalizedJid = jidNormalizedUser(jid);
    return admins.includes(normalizedJid.split('@')[0]); // Comparer seulement le numéro
}

/**
 * Vérifie si le JID est le propriétaire du bot.
 * @param {string} jid
 * @param {string} ownerNumber
 * @returns {boolean}
 */
function isOwner(jid, ownerNumber) {
    const normalizedJid = jidNormalizedUser(jid);
    return normalizedJid.startsWith(ownerNumber);
}

/**
 * Récupère les participants d'un groupe.
 * @param {import('@adiwajshing/baileys').WASocket} sock
 * @param {string} groupId - Le JID du groupe.
 * @returns {Array<string>} Liste des JIDs des participants.
 */
async function getGroupParticipants(sock, groupId) {
    try {
        const metadata = await sock.groupMetadata(groupId);
        return metadata.participants.map(p => p.id);
    } catch (error) {
        console.error(`Erreur lors de la récupération des participants du groupe ${groupId}:`, error);
        return [];
    }
}

module.exports = {
    sendMessage,
    sendImage,
    sendSticker,
    isAdmin,
    isOwner,
    getGroupParticipants,
};
