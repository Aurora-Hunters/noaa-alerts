/**
 * Load environment variables
 */
require('dotenv').config();

const CHANNEL_ID = process.env.CHANNEL_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ALERTS_URL = process.env.ALERTS_URL;
const DISCUSSION_URL = process.env.DISCUSSION_URL;
const SOLAR_MAR_URL = process.env.SOLAR_MAR_URL;
const K_INDEX_FORECAST_URL = process.env.K_INDEX_FORECAST_URL;
const SCHEDULE = process.env.SCHEDULE;

const TelegramBot = require('node-telegram-bot-api');
const QuickChart = require('quickchart-js');
const axios = require('axios');
const cron = require('node-cron');
const hash = require('object-hash');
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
    synopticMap: [],
    k_index: []
}).write()

const main = async function () {
  console.log('Running a task');

  /**
   * Check for alerts
   */
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

  /**
   * Check for a new discussion
   */
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

  /**
   * Check for k-index forecast
   */
  axios.get(K_INDEX_FORECAST_URL)
    .then(async function (response) {
      const data  = response.data;
      const labels = [];
      const kIndexes = [];

      /**
       * Remove header ["time_tag","kp","observed","noaa_scale"]
       */
      data.shift();

      /**
       * Remove data for past hours
       */
      data.filter(item => {
        const date = new Date(item[0]);

        date.setTime(date.getTime() + (3 * 60 * 60 * 1000));

        return date - new Date() + (3 * 60 * 60 * 1000) >= 0;
      })
        .map(item => {
          labels.push(item[0]);
          kIndexes.push(item[1]);
        });

      const lastEvent = {
        hash: hash({
          labels,
          kIndexes
        })
      };

      // For performance, use .value() instead of .write() if you're only reading from db
      const inDB = await db.get('k_index').find(lastEvent).value();

      if (!inDB) {
        await db.get('k_index')
          .push(lastEvent)
          .write()

        const chart = new QuickChart();

        chart.setWidth(900)
        chart.setHeight(400);

        const monthShortNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
        ];
        const timeNow = `${(new Date).getDate()} ${monthShortNames[(new Date).getMonth()]} ${(new Date).getHours()}:${(new Date).getMinutes() < 10 ? '0' : ''}${(new Date).getMinutes()}`

        chart.setConfig({
          type: 'bar',
          data: {
            labels: labels.map(date => {
              let dateItem = new Date(date);

              dateItem.setTime(dateItem.getTime() + (3 * 60 * 60 * 1000));

              const DAY = `${dateItem.getDate()}`;
              const HOUR = `${dateItem.getHours()}`;

              if (HOUR === '0') {
                return `${DAY} ${monthShortNames[dateItem.getMonth()]}`;
              }

              return `${HOUR}:00`;
            }),
            datasets: [{
              data: kIndexes,
              fill: true,
              borderColor: '#ffffff22',
              backgroundColor: kIndexes.map(kIndex => {
                // if (kIndex <= 2) return 'rgba(115, 191, 32, 0.88)';
                // if (kIndex <= 3) return 'rgba(133, 255, 0, 0.88)';
                // if (kIndex <= 4) return 'rgba(224, 180, 0, 0.88)';
                // if (kIndex <= 5) return 'rgba(250, 100, 0, 0.88)';
                // if (kIndex <= 6) return 'rgba(196, 22, 42, 0.88)';
                // if (kIndex <= 7) return 'rgba(172, 0, 255, 0.88)';
                // if (kIndex <= 8) return 'rgba(31, 96, 196, 0.88)';
                // if (kIndex <= 9) return 'rgba(45, 45, 45, 0.88)';


                if (kIndex <= 2) return '#1e3731fa';
                if (kIndex <= 3) return '#3c6322fa';
                if (kIndex <= 4) return '#919733fa';
                if (kIndex <= 5) return '#804b19fa';
                if (kIndex <= 6) return '#58212afa';
                if (kIndex <= 7) return '#40253bfa';
                if (kIndex <= 8) return '#232d40fa';
                if (kIndex <= 9) return '#000000fa';
              }),
              borderWidth: 1
            }]
          },
          options: {
            legend: {
              display: false
            },
            annotation: {
              annotations: labels.map((date, index) => {
                let dateItem = new Date(date);

                dateItem.setTime(dateItem.getTime() + (3 * 60 * 60 * 1000));

                const DAY = `${dateItem.getDate()}`;
                const HOUR = `${dateItem.getHours()}`;

                if (HOUR === '0') {
                  return {
                    type: 'line',
                    mode: 'vertical',
                    scaleID: 'x-axis-0',
                    value: index,
                    borderColor: '#aaa',
                  };
                }

                return [];
              })
                .filter(value => {
                  return value !== [];
                }),
            },
            title: {
              display: true,
              text: `NOAA planetary k-index forecast • auroralights.ru • t.me/solar_activity_alerts • ${timeNow}`,
              fontColor: '#ffffff',
              fontSize: 18
            },
            plugins: {
              backgroundImageUrl: 'https://capella.pics/c41364dd-9f1b-454d-8edb-7064727c4a1d.jpg',
            },
            scales: {
              yAxes: [{
                ticks: {
                  min: 0,
                  max: 9,
                  stepSize: 1,
                  fontColor: '#aaa'
                },
                gridLines: {
                  color: '#aaa'
                }
              }],
              xAxes: [{
                ticks: {
                  fontColor: '#aaa'
                },
                gridLines: {
                  color: 'transparent'
                }
              }]
            }
          }
        });

        const chartFileName = 'chart.png';

        await chart.toFile(chartFileName);
        await bot.sendPhoto(CHANNEL_ID, chartFileName, {
          disable_notification: true
        });
        try { fs.unlinkSync(chartFileName) } catch(err) {}
      }
    })
    .catch(function (error) {
      console.log(error);
    })

  /**
   * Check for handwritten solar map
   */
  imageHash(`${SOLAR_MAR_URL}?t=${Date.now()}`,  16, true, async (error, data) => {
    if (error) throw error;

    const lastEvent = {
      hash: data
    };

    const inDB = !!(db.get('synopticMap').find(lastEvent).value());

    if (!inDB) {
      await db.get('synopticMap')
        .push(lastEvent)
        .write()

      bot.sendPhoto(CHANNEL_ID, `${SOLAR_MAR_URL}?t=${Date.now()}`);
    }
  });
};

cron.schedule(SCHEDULE, main);

// main();


