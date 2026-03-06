const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const Parser = require('rss-parser');
const cron = require('node-cron');
const express = require('express');
const pino = require('pino');

const app = express();
app.get('/', (req, res) => res.send('WhatsApp Bot is Alive!'));
app.listen(process.env.PORT || 3000, () => console.log('Server is running...'));

const RSS_URL = 'https://channelabd.com/rss.php'; 
// ⚠️ নিচে আপনার হোয়াটসঅ্যাপ চ্যানেলের ID টি বসান
const CHANNEL_JID = '0029VbCCyU59MF9ARXY2xw39'; 

let lastArticleGuid = '';
const parser = new Parser();

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        browser: ['Windows', 'Chrome', '111.0'], // কানেকশন যেন না কাটে তার ট্রিক
        logger: pino({ level: 'silent' }),
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if(qr) {
            console.log('\n=========================================');
            console.log('নিচের QR কোডটি হোয়াটসঅ্যাপ থেকে স্ক্যান করুন');
            console.log('=========================================\n');
            qrcode.generate(qr, { small: true });
        }
        
        if(connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('কানেকশন রিস্টার্ট হচ্ছে...');
            if(shouldReconnect) {
                startBot();
            } else {
                console.log('লগআউট হয়ে গেছে! আবার নতুন করে স্ক্যান করতে হবে।');
            }
        } else if(connection === 'open') {
            console.log('✅ হোয়াটসঅ্যাপ সফলভাবে কানেক্ট হয়েছে!');
        }
    });

    // প্রতি ১০ মিনিট পর পর ওয়েবসাইট চেক করবে
    cron.schedule('*/10 * * * *', async () => {
        try {
            let feed = await parser.parseURL(RSS_URL);
            if (feed.items.length > 0) {
                let latest = feed.items[0];
                if (latest.guid !== lastArticleGuid) {
                    lastArticleGuid = latest.guid;
                    let message = `🔴 *${latest.title}*\n\nবিস্তারিত পড়ুন: 👇\n${latest.link}`;
                    
                    if (CHANNEL_JID !== '0029VbCCyU59MF9ARXY2xw39') {
                        await sock.sendMessage(CHANNEL_JID, { text: message });
                        console.log('✅ চ্যানেলে খবর পাঠানো হয়েছে:', latest.title);
                    }
                }
            }
        } catch (error) {
            console.log('খবর আনতে সমস্যা:', error.message);
        }
    });
}

startBot();
