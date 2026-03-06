const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const Parser = require('rss-parser');
const cron = require('node-cron');
const express = require('express');
const pino = require('pino');
const fs = require('fs');
const QRCode = require('qrcode');

const app = express();
let currentQR = '';
let connectionStatus = 'Connecting...';

// ==========================================
// ১০০% গ্যারান্টিড QR Code জেনারেটর
// ==========================================
app.get('/', async (req, res) => {
    if (connectionStatus === 'connected') {
        res.send('<h1 style="color:green;text-align:center;margin-top:50px;">✅ হোয়াটসঅ্যাপ সফলভাবে কানেক্ট হয়েছে! বট কাজ করছে...</h1>');
    } else if (currentQR) {
        try {
            // গুগল API এর বদলে সরাসরি লোকাল ইমেজ তৈরি
            const qrImage = await QRCode.toDataURL(currentQR);
            res.send(`
                <html>
                <head><meta http-equiv="refresh" content="5"></head>
                <body style="text-align:center;margin-top:50px;font-family:sans-serif;background:#f4f4f4;">
                    <div style="background:#fff;display:inline-block;padding:30px;border-radius:10px;box-shadow:0 4px 10px rgba(0,0,0,0.1);">
                        <h2 style="color:#333;">নিচের QR কোডটি হোয়াটসঅ্যাপ থেকে স্ক্যান করুন</h2>
                        <img src="${qrImage}" alt="QR Code" style="border:2px solid #ddd; padding:10px; border-radius:10px; width:300px; height:300px;"/>
                        <p style="color:#d9534f;font-weight:bold;margin-top:15px;">পেজটি নিজে নিজেই রিলোড হবে, দয়া করে কাটবেন না।</p>
                    </div>
                </body>
                </html>
            `);
        } catch (err) {
            res.send('<h2 style="text-align:center;">QR Code লোড হতে সমস্যা হচ্ছে...</h2>');
        }
    } else {
        res.send(`
            <html>
            <head><meta http-equiv="refresh" content="5"></head>
            <body style="text-align:center;margin-top:50px;font-family:sans-serif;">
                <h2 style="color:#555;">অপেক্ষা করুন, বট রেডি হচ্ছে...</h2>
                <p>পেজটি নিজে নিজেই রিলোড হবে।</p>
                <br><br>
                <a href="/reset" style="display:inline-block; padding:10px 20px; background:#d9534f; color:white; text-decoration:none; border-radius:5px;">বট Reset করুন</a>
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
    setTimeout(() => process.exit(0), 1000); 
});

app.listen(process.env.PORT || 3000, () => console.log('Server is running...'));

const RSS_URL = 'https://channelabd.com/rss.php'; 
const CHANNEL_INVITE_CODE = '0029VbCCyU59MF9ARXY2xw39'; 

let lastArticleGuid = '';
let realChannelJid = null;
const parser = new Parser();

async function startBot() {
    console.log('বট চালু হচ্ছে...');
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    console.log('মেমোরি লোড হয়েছে...');
    
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
            console.log('✅ QR Code তৈরি হয়েছে! ওয়েবসাইটে যান।');
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
