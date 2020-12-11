/**
 * Load environment variables
 */
require('dotenv').config();

// const CHANNEL_ID = process.env.CHANNEL_ID;
const CHANNEL_ID = 44841343;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ALERTS_URL = process.env.ALERTS_URL;
const SCHEDULE = process.env.SCHEDULE;

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(BOT_TOKEN, {polling: true});

// Prepare database
const adapter = new FileSync('db.json');
const db = low(adapter);

// Set db default values
db.defaults({ alerts: [] }).write()

cron.schedule(SCHEDULE, async () => {
    console.log('Running a task');

    axios.get(ALERTS_URL)
        .then(async function (response) {
            const data = response.data;
            const lastEvent = data.slice(-1)[0];

            // For performance, use .value() instead of .write() if you're only reading from db
            const inDB = !!(db.get('alerts').find(lastEvent).value());

            if (!inDB) {
                await db.get('alerts')
                    .push(lastEvent)
                    .write()

                bot.sendMessage(CHANNEL_ID, lastEvent.message);
            }
        })
        .catch(function (error) {
            console.log(error);
        })
});

