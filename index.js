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
const MESOSPHERIC_CLOUD_MAP = process.env.MESOSPHERIC_CLOUD_MAP;

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
const get_directory = require('./utils/get-directory');

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(BOT_TOKEN);

bot.on('message', console.log)

// Prepare database
const adapter = new FileSync('db.json');
const db = low(adapter);

// Set db default values
db.defaults({
  alerts: [],
  discussion: [],
  synopticMap: [],
  k_index: [],
  mesosphericCloudMap: [],
}).write()

const PATH_TO_STORAGE = path.join(__dirname, 'storage');

get_directory(PATH_TO_STORAGE);

const main = async function () {
  console.log('Running a task');

  /**
   * Check for alerts
   */
  await axios.get(ALERTS_URL)
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
  await axios.get(DISCUSSION_URL)
    .then(async function (response) {
      let data = response.data;

      const lastEvent = {
        // issue_datetime: '2021 Feb 21 0030 UTC',
        message: data
      };

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
  await axios.get(K_INDEX_FORECAST_URL)
    .then(async function (response) {
      const data  = response.data;
      let labels = [];
      let kIndexes = [];

      /**
       * Remove header ["time_tag","kp","observed","noaa_scale"]
       */
      data.shift();

      data.forEach(item => {
          labels.push(item[0]);
          kIndexes.push(item[1]);
        });

      const event = {
        hash: hash({
          labels,
          kIndexes
        })
      };

      labels = [];
      kIndexes = [];

      /**
       * Remove data for past hours
       */
      data.filter(item => {
          const date = new Date(item[0]);

          date.setTime(date.getTime() + (3 * 60 * 60 * 1000));

          return date - new Date() + (3 * 60 * 60 * 1000) >= 0;
        })
        .forEach(item => {
          labels.push(item[0]);
          kIndexes.push(item[1]);
        });

      // For performance, use .value() instead of .write() if you're only reading from db
      const inDB = await db.get('k_index').find(event).value();

      if (!inDB) {
        await db.get('k_index')
          .push(event)
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
                if (kIndex < 3) return '#1e3731fa';
                if (kIndex < 4) return '#3c6322fa';
                if (kIndex >= 4) return '#919733fa';
                if (kIndex >= 5) return '#804b19fa';
                if (kIndex >= 6) return '#58212afa';
                if (kIndex >= 7) return '#40253bfa';
                if (kIndex >= 8) return '#232d40fa';
                if (kIndex >= 9) return '#000000fa';
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
                    borderColor: '#aaaaaa55',
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
              text: `NOAA planetary k-index forecast • auroralights.ru • t.me/solar_activity_alerts • ${timeNow} MSK`,
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
                  color: '#aaaaaa55'
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

        const chartFileName = path.join(PATH_TO_STORAGE, 'noaa-3days-chart.png');

        await chart.toFile(chartFileName);
        await bot.sendPhoto(CHANNEL_ID, chartFileName);

        // try { fs.unlinkSync(chartFileName) } catch(err) {}

      //   /** Composing description */
      //   const numberOfElements = 8;
      //   let description = "Прогнозы сияний и оповещения о вспышках\n" +
      //     "\n" +
      //     "Прогноз КП-индекса от NOAA на 24 часа:\n" +
      //     "\n";
      //
      //
      //   labels.slice(0, numberOfElements).forEach((date, index) => {
      //     let dateItem = new Date(date);
      //     const monthShortNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
      //       "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
      //     ];
      //
      //     dateItem.setTime(dateItem.getTime() + (3 * 60 * 60 * 1000));
      //
      //     const DAY = `${dateItem.getDate()}`;
      //     const HOUR = dateItem.getHours();
      //     const HOUR12 = (dateItem.getHours() + 24) % 12 || 12;
      //
      //
      //     if (index === 0) {
      //       description += `${DAY} ${monthShortNames[dateItem.getMonth()]}\n`;
      //     }
      //
      //     let emojiClock;
      //     let emojiBlock;
      //
      //     switch (HOUR12) {
      //       case 1:  emojiClock = '🕐'; break;
      //       case 2:  emojiClock = '🕑'; break;
      //       case 3:  emojiClock = '🕒'; break;
      //       case 4:  emojiClock = '🕓'; break;
      //       case 5:  emojiClock = '🕔'; break;
      //       case 6:  emojiClock = '🕕'; break;
      //       case 7:  emojiClock = '🕖'; break;
      //       case 8:  emojiClock = '🕗'; break;
      //       case 9:  emojiClock = '🕘'; break;
      //       case 10: emojiClock = '🕙'; break;
      //       case 11: emojiClock = '🕚'; break;
      //       case 12: emojiClock = '🕛'; break;
      //     }
      //
      //     if (index === 0) {
      //       emojiClock = '👉';
      //     }
      //
      //     switch (kIndexes[index]) {
      //       case '0':
      //       case '1':
      //       case '2':
      //       case '3':  emojiBlock = '🟩'; break;
      //       case '4':  emojiBlock = '🟨'; break;
      //       case '5':  emojiBlock = '🟧'; break;
      //       case '6':  emojiBlock = '🟥'; break;
      //       case '7':  emojiBlock = '🟪'; break;
      //       case '8':  emojiBlock = '🟦'; break;
      //       case '9':  emojiBlock = '⬛'; break;
      //     }
      //
      //     if (HOUR === 0) {
      //       description += `${DAY} ${monthShortNames[dateItem.getMonth()]}\n`;
      //     }
      //
      //     description += `${emojiClock}${emojiBlock.repeat(kIndexes[index])}\n`;
      //   });
      //
      //   // console.log(description);
      //
      //   // await new Promise(r => setTimeout(r, 10000));
      //   await bot.setChatDescription(CHANNEL_ID, description);
      //   /** end of composing description */
      }
    })
    .catch(function (error) {
      console.log(error);
    })

  /**
   * Check for handwritten solar map
   */
  try {
    imageHash(`${SOLAR_MAR_URL}?t=${Date.now()}`, 16, true, async (error, data) => {
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
  } catch (e) {
    console.log(`-_- Error: ${e}`)
  }

  // /**
  //  * Check for mesospheric cloud map
  //  */
  // try {
  //   imageHash(`${MESOSPHERIC_CLOUD_MAP}?t=${Date.now()}`, 16, true, async (error, data) => {
  //     if (error) throw error;
  //
  //     const lastEvent = {
  //       hash: data
  //     };
  //
  //     const inDB = !!(db.get('mesosphericCloudMap').find(lastEvent).value());
  //
  //     if (!inDB) {
  //       await db.get('mesosphericCloudMap')
  //         .push(lastEvent)
  //         .write()
  //
  //       bot.sendPhoto(CHANNEL_ID, `${MESOSPHERIC_CLOUD_MAP}?t=${Date.now()}`);
  //     }
  //   });
  // } catch (e) {
  //   console.log(`-_- Error: ${e}`)
  // }
};


// cron.schedule(SCHEDULE, main);

(async () => {
  await main();

  cron.schedule(SCHEDULE, main);
})();


