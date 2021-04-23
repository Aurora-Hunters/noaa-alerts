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

        return date > new Date();
      })
        .map(item => {
          labels.push(item[0]);
          kIndexes.push(item[1]);
        });

      const lastEvent = {
        message: data
      };

      // For performance, use .value() instead of .write() if you're only reading from db
      const inDB = !!(db.get('k_index').find(lastEvent).value());

      if (!inDB) {
        await db.get('k_index')
          .push(lastEvent)
          .write()

        const chart = new QuickChart();

        chart.setWidth(900)
        chart.setHeight(400);

        let chartUrl = 'https://quickchart.io/chart';

        chart.setConfig({
          type: 'bar',
          data: {
            labels: labels.map(date => {
              const monthShortNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
              ];
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
              backgroundColor: kIndexes.map(kIndex => {
                if (kIndex <= 3) return '#00ff00';
                if (kIndex <= 5) return '#ffff00';
                if (kIndex <= 9) return '#ff0000';
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
              text: 'NOAA planetary k-index forecast • auroralights.ru • t.me/solar_activity_alerts',
              fontColor: '#ffffff',
              fontSize: 18
            },
            plugins: {
              backgroundImageUrl: 'https://capella.pics/13da7ff1-b9cc-4838-8baa-eab18b2829cf.jpg',
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
        await bot.sendPhoto(CHANNEL_ID, chartFileName);
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



