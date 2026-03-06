const express = require('express');
const app = express();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Parser = require('rss-parser');
const cron = require('node-cron');

// বট সজাগ রাখার জন্য Web Server
app.get('/', (req, res) => res.send('WhatsApp Bot is Alive!'));
app.listen(process.env.PORT || 3000, () => console.log('Server is running...'));

const parser = new Parser();
const RSS_URL = 'https://channelabd.com/rss.php'; // আপনার RSS লিংক
let lastArticleGuid = '';

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('=========================================');
    console.log('নিচের QR কোডটি আপনার হোয়াটসঅ্যাপ থেকে স্ক্যান করুন');
    console.log('=========================================');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('✅ হোয়াটসঅ্যাপ বট সফলভাবে কানেক্ট হয়েছে!');

    // চ্যানেল আইডি বের করা
    const chats = await client.getChats();
    const channels = chats.filter(c => c.id._serialized.endsWith('@newsletter'));

    console.log('\n--- আপনার হোয়াটসঅ্যাপ চ্যানেলগুলোর ID ---');
    channels.forEach(c => {
        console.log(`নাম: ${c.name} | ID: ${c.id._serialized}`);
    });
    console.log('-------------------------------------------\n');

    // প্রতি ১০ মিনিট পর পর চেক করবে
    cron.schedule('*/10 * * * *', () => {
        checkAndSendNews();
    });
});

async function checkAndSendNews() {
    try {
        let feed = await parser.parseURL(RSS_URL);
        if (feed.items.length > 0) {
            let latestArticle = feed.items[0];

            if (latestArticle.guid !== lastArticleGuid) {
                lastArticleGuid = latestArticle.guid;

                let message = `*${latestArticle.title}*\n\nবিস্তারিত পড়ুন: \n${latestArticle.link}`;

                // ⚠️ এখানে আপনার চ্যানেলের ID বসাতে হবে
                const channelId = 'YOUR_CHANNEL_ID_HERE';

                if(channelId !== 'YOUR_CHANNEL_ID_HERE') {
                    await client.sendMessage(channelId, message);
                    console.log('✅ চ্যানেলে খবর পাঠানো হয়েছে: ' + latestArticle.title);
                } else {
                    console.log('⚠️ অনুগ্রহ করে কোডে আপনার চ্যানেলের ID বসান!');
                }
            }
        }
    } catch (error) {
        console.log('খবর আনতে সমস্যা হয়েছে:', error.message);
    }
}

client.initialize();
