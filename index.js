const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const Parser = require('rss-parser');
const cron = require('node-cron');
const express = require('express');
const pino = require('pino');
const fs = require('fs');

const app = express();
let currentQR = '';
let connectionStatus = 'Connecting...';

// ==========================================
// ওয়েবসাইটে QR Code এবং Auto-Reload সিস্টেম
// ==========================================
app.get('/', (req, res) => {
    if (connectionStatus === 'connected') {
        res.send('<h1 style="color:green;text-align:center;margin-top:50px;">✅ হোয়াটসঅ্যাপ সফলভাবে কানেক্ট হয়েছে! বট কাজ করছে...</h1>');
    } else if (currentQR) {
        res.send(`
            <html>
            <head>
                <meta http-equiv="refresh" content="10"> </head>
            <body style="text-align:center;margin-top:50px;font-family:sans-serif;">
                <h2>নিচের QR কোডটি হোয়াটসঅ্যাপ থেকে স্ক্যান করুন</h2>
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}" alt="QR Code" style="border: 2px solid #ccc; padding: 10px; border-radius: 10px;"/>
                <p style="color:red;font-weight:bold;margin-top:15px;">পেজটি নিজে নিজেই রিলোড হবে, দয়া করে কাটবেন না।</p>
            </body>
            </html>
        `);
    } else {
        res.send(`
            <html>
            <head><meta http-equiv="refresh" content="5"></head>
            <body style="text-align:center;margin-top:50px;font-family:sans-serif;">
                <h2>অপেক্ষা করুন, QR কোড তৈরি হচ্ছে...</h2>
                <p>সার্ভার রেডি হচ্ছে, পেজটি নিজে নিজেই রিলোড হবে।</p>
                <br><br><br>
                <p style="color:gray; font-size:14px;">যদি ২ মিনিট পরও QR কোড না আসে, তবে নিচের বাটনে ক্লিক করুন:</p>
                <a href="/reset" style="display:inline-block; padding:10px 20px; background:red; color:white; text-decoration:none; border-radius:5px; font-weight:bold;">বট Reset করুন</a>
            </body>
            </html>
        `);
    }
});

// মেমোরি জ্যাম হলে রিসেট করার লজিক
app.get('/reset', (req, res) => {
    if(fs.existsSync('auth_info_baileys')) {
        fs.rmSync('auth_info_baileys', { recursive: true, force: true });
    }
    res.send('<h2 style="text-align:center;margin-top:50px;color:green;">বট সফলভাবে রিসেট হয়েছে! <br><br> <a href="/">এখানে ক্লিক করে মূল পেজে ফিরে যান</a></h2>');
    setTimeout(() => process.exit(0), 1000); // সার্ভার রিস্টার্ট করবে
});

app.listen(process.env.PORT || 3000, () => console.log('Server is running...'));

const RSS_URL = 'https://channelabd.com/rss.php'; 
const CHANNEL_INVITE_CODE = '0029VbCCyU59MF9ARXY2xw39'; 

let lastArticleGuid = '';
let realChannelJid = null;
const parser = new Parser();

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        browser: ['Windows', 'Chrome', '111.0'], 
        logger: pino({ level: 'silent' }),
        syncFullHistory: false,
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if(qr) {
            currentQR = qr; 
            console.log('✅ QR Code ওয়েবসাইটে লাইভ করা হয়েছে!');
        }
        
        if(connection === 'close') {
            connectionStatus = 'disconnected';
            currentQR = '';
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('কানেকশন বন্ধ হয়েছে। আবার চালু হচ্ছে...');
            if(shouldReconnect) {
                startBot();
            } else {
                console.log('লগআউট হয়ে গেছে!');
                if(fs.existsSync('auth_info_baileys')) {
                    fs.rmSync('auth_info_baileys', { recursive: true, force: true });
                }
                startBot();
            }
        } else if(connection === 'open') {
            currentQR = '';
            connectionStatus = 'connected';
            console.log('\n✅ হোয়াটসঅ্যাপ সফলভাবে কানেক্ট হয়েছে!');
            
            try {
                console.log('চ্যানেলের আসল ID খোঁজা হচ্ছে...');
                const metadata = await sock.newsletterMetadata("invite", CHANNEL_INVITE_CODE);
                realChannelJid = metadata.id;
                console.log('✅ আপনার চ্যানেলের আসল ID পাওয়া গেছে: ' + realChannelJid);
            } catch(err) {
                console.log('⚠️ চ্যানেল ID বের করতে সমস্যা হয়েছে:', err.message);
            }
        }
    });

    cron.schedule('*/10 * * * *', async () => {
        if(!realChannelJid || connectionStatus !== 'connected') return;
        
        try {
            let feed = await parser.parseURL(RSS_URL);
            if (feed.items.length > 0) {
                let latest = feed.items[0];
                if (latest.guid !== lastArticleGuid) {
                    lastArticleGuid = latest.guid;
                    let message = `🔴 *${latest.title}*\n\nবিস্তারিত পড়ুন: 👇\n${latest.link}`;
                    
                    await sock.sendMessage(realChannelJid, { text: message });
                    console.log('✅ সফলভাবে চ্যানেলে খবর পাঠানো হয়েছে:', latest.title);
                }
            }
        } catch (error) {}
    });
}

startBot();
