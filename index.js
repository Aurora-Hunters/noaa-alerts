/**
 * Load environment variables
 */
require('dotenv').config();

const CHANNEL_ID = process.env.CHANNEL_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ALERTS_URL = process.env.ALERTS_URL;
const DISCUSSION_URL = process.env.DISCUSSION_URL;
const SOLAR_MAR_URL = process.env.SOLAR_MAR_URL;
const SCHEDULE = process.env.SCHEDULE;

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const { imageHash }= require('image-hash');

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(BOT_TOKEN, {polling: true});

// Prepare database
const adapter = new FileSync('db.json');
const db = low(adapter);

// Set db default values
db.defaults({
    alerts: [],
    discussion: [],
    synopticMap: []
}).write()

cron.schedule(SCHEDULE, async () => {
    console.log('Running a task');

    axios.get(ALERTS_URL)
        .then(async function (response) {
            const data = response.data;
            const lastEvent = data[0];

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

    axios.get(DISCUSSION_URL)
        .then(async function (response) {
            let data = response.data;

            const lastEvent = {
                // issue_datetime: '2021 Feb 21 0030 UTC',
                message: data
            };

            // For performance, use .value() instead of .write() if you're only reading from db
            const inDB = !!(db.get('discussion').find(lastEvent).value());

            if (!inDB) {
                await db.get('discussion')
                    .push(lastEvent)
                    .write()

                bot.sendMessage(CHANNEL_ID, lastEvent.message);
            }
        })
        .catch(function (error) {
            console.log(error);
        })

    imageHash(SOLAR_MAR_URL,  16, true, async (error, data) => {
        if (error) throw error;

        const lastEvent = {
            hash: data
        };

        const inDB = !!(db.get('synopticMap').find(lastEvent).value());

        if (!inDB) {
            await db.get('synopticMap')
                .push(lastEvent)
                .write()

            bot.sendPhoto(CHANNEL_ID, SOLAR_MAR_URL);
        }
    });
});

