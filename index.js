const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const Parser = require('rss-parser');
const cron = require('node-cron');
const express = require('express');
const pino = require('pino');

const app = express();
app.get('/', (req, res) => res.send('Bot is Alive!'));
app.listen(process.env.PORT || 3000, () => console.log('Server is running...'));

const RSS_URL = 'https://channelabd.com/rss.php'; 

// ⚠️ এখানে আপনার হোয়াটসঅ্যাপ চ্যানেলের ID টি বসান
const CHANNEL_JID = 'YOUR_CHANNEL_ID_HERE'; 

let lastArticleGuid = '';
const parser = new Parser();

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }) 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if(qr) {
            console.log('\n=========================================');
            console.log('নিচের QR কোডটি আপনার হোয়াটসঅ্যাপ থেকে স্ক্যান করুন');
            console.log('=========================================\n');
            qrcode.generate(qr, { small: true });
        }
        if(connection === 'close') {
            console.log('কানেকশন বন্ধ হয়েছে, আবার যুক্ত করা হচ্ছে...');
            startBot();
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
                    
                    if (CHANNEL_JID !== 'YOUR_CHANNEL_ID_HERE') {
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
