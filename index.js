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
// আপনার হোয়াটসঅ্যাপ চ্যানেলের ইনভাইট কোড
const CHANNEL_INVITE_CODE = '0029VbCCyU59MF9ARXY2xw39'; 

let lastArticleGuid = '';
let realChannelJid = null; // বট অটোমেটিক আসল আইডি এখানে সেভ করবে
const parser = new Parser();

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        browser: ['Windows', 'Chrome', '111.0'], 
        logger: pino({ level: 'silent' }),
        syncFullHistory: false,
        printQRInTerminal: false // এরর সরানোর জন্য এটি বন্ধ করে নিচে কাস্টমাইজ করা হলো
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if(qr) {
            console.log('\n==================================================');
            console.log('👇 নিচের QR কোডটি আপনার হোয়াটসঅ্যাপ থেকে স্ক্যান করুন 👇');
            console.log('==================================================\n');
            qrcode.generate(qr, { small: true });
            console.log('\n==================================================\n');
        }
        
        if(connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('কানেকশন বন্ধ হয়েছে। আবার চালু হচ্ছে...');
            if(shouldReconnect) {
                startBot();
            } else {
                console.log('লগআউট হয়ে গেছে! Render থেকে Clear build cache করে আবার স্ক্যান করুন।');
            }
        } else if(connection === 'open') {
            console.log('\n✅ হোয়াটসঅ্যাপ সফলভাবে কানেক্ট হয়েছে!');
            
            // ইনভাইট কোড থেকে আসল ID বের করার ম্যাজিক ট্রিক
            try {
                console.log('চ্যানেলের আসল ID খোঁজা হচ্ছে...');
                const metadata = await sock.newsletterMetadata("invite", CHANNEL_INVITE_CODE);
                realChannelJid = metadata.id;
                console.log('✅ আপনার চ্যানেলের আসল ID পাওয়া গেছে: ' + realChannelJid);
                console.log('🎉 আপনার নিউজ বট এখন ১০০% প্রস্তুত! প্রতি ১০ মিনিট পর পর চেক করবে।');
            } catch(err) {
                console.log('⚠️ চ্যানেল ID বের করতে সমস্যা হয়েছে:', err.message);
            }
        }
    });

    // প্রতি ১০ মিনিট পর পর ওয়েবসাইট চেক করবে
    cron.schedule('*/10 * * * *', async () => {
        if(!realChannelJid) {
            console.log('⏳ চ্যানেল ID এখনও পাওয়া যায়নি, অপেক্ষা করুন...');
            return;
        }
        
        try {
            console.log('নতুন নিউজের জন্য ওয়েবসাইট চেক করা হচ্ছে...');
            let feed = await parser.parseURL(RSS_URL);
            if (feed.items.length > 0) {
                let latest = feed.items[0];
                if (latest.guid !== lastArticleGuid) {
                    lastArticleGuid = latest.guid;
                    let message = `🔴 *${latest.title}*\n\nবিস্তারিত পড়ুন: 👇\n${latest.link}`;
                    
                    await sock.sendMessage(realChannelJid, { text: message });
                    console.log('✅ সফলভাবে চ্যানেলে খবর পাঠানো হয়েছে:', latest.title);
                } else {
                    console.log('👀 নতুন কোনো খবর নেই।');
                }
            }
        } catch (error) {
            console.log('❌ খবর আনতে সমস্যা:', error.message);
        }
    });
}

startBot();
