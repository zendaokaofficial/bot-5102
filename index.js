const makeWASocketCont = require("@whiskeysockets/baileys");
const makeWASocket = makeWASocketCont.default;
const { useMultiFileAuthState, DisconnectReason } = makeWASocketCont;
const { MessageType, MessageOptions, Mimetype } = require("@whiskeysockets/baileys");
const XLSX = require("xlsx");
const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');
const schedule = require('node-schedule');
const moment = require('moment-timezone');

async function batchGetValues(spreadsheetId, range, keySpreadsheet) {
  try {
    const auth = new GoogleAuth({
      keyFilename: keySpreadsheet,
      scopes: 'https://www.googleapis.com/auth/spreadsheets',
    });

    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
    const ranges = [range];

    const result = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
    });

    const values = result.data.valueRanges[0].values;

    return values

  } catch (err) {
    console.error('Error reading Google Sheet:', err.message);
    return null;
  }
}

async function connectionLogic() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
  const sock = makeWASocket({
    printQRInTerminal: true,
    auth: state,
  });

  const job = schedule.scheduleJob('*/2 * * * *', async () => {
    // Add your job logic here
    // console.log("otw running nih bos");
    const db_reminder = await batchGetValues('1YTUWIBlqxnYHXCL2VnBLzmcpJKzBBeEgXgh4mZlsXwM', 'C2:H1000', './keywoardSpreadsheet.json');
    // console.log(db_reminder);

    const namakeg = db_reminder.map(innerArray => innerArray[1]);
    const desckeg = db_reminder.map(innerArray => innerArray[2]);
    const filekeg = db_reminder.map(innerArray => innerArray[3]);
    const dateStrings = db_reminder.map(innerArray => innerArray[5]);
  
    const dateObjects = dateStrings.map(dateString => {
      const parts = dateString.split(/[\s/:]/);
      return new Date(parts[2], parts[0] - 1, parts[1], parts[3], parts[4], parts[5]);
    });
  
    async function checkScheduledDates() {
      const currentDate = moment().tz('Asia/Makassar');
      
      for (const [index, scheduledDate] of dateObjects.entries()) {
        const scheduledMoment = moment(scheduledDate).tz('Asia/Makassar');
        const difference = currentDate.diff(scheduledMoment, 'milliseconds');
    
        if (Math.abs(difference) < 60000) { // Within a 1-minute range
          console.log(`Sekarang at index ${index}`);
          const mess = `*${namakeg[index]}* \n \n${desckeg[index]}`;
    
          // Assuming 'id' is the JID of your group chat
          const groupChatId = '120363237423277108@g.us';

          // Your message sending logic here
          await sock.sendMessage(groupChatId, {
          text: mess});

          if(filekeg[index]){
            await sock.sendMessage(groupChatId, {
              text: `file dapat diakses pada link berikut:\n \n${filekeg[index]}`});
          }
        }
      }
    }    
  
    checkScheduledDates();
  });
  
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (update?.qr) {
      console.log(update?.qr);
      // write custom logic over here
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        connectionLogic();
      }
    }
  });

  sock.ev.on('messages.update', (messageInfo) => {
    // console.log(messageInfo);
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {

    // script di bawah adalah ketika ada pesan perintah yang termasuk dalam database keywords
    if (type === "notify" && messages[0].message) {

      const messageContent = messages[0].message.conversation;

      if (!messages[0].key.fromMe && messageContent.startsWith("!")) {
        const id = messages[0].key.remoteJid;

        console.log(JSON.stringify(messages, undefined, 2))
        
        const db_keyword =  await batchGetValues('1pTG32m6rDxzu75W5N-rdQSHEGnQmK7PlmYmhOXxUvMo', 'A2:D1000', './keywoardSpreadsheet.json');

        const key = db_keyword.map(innerArray => innerArray[1]);
        const desc = db_keyword.map(innerArray => innerArray[2]);
        const out = db_keyword.map(innerArray => innerArray[3]);

        // pesan yang mengandung info
        const containsInfo = key.some(item => messageContent.includes(`${item} —info`));

        if (messageContent === "!list"){

          const transformedString = `Berikut beberapa perintah yang bisa anda ketikkan:\n${key.map(item => `- ${item}`).join('\n')}`;
          await sock.sendMessage(id, { text: transformedString });
        }

        else if (key.includes(messageContent)) {
          
          const index = key.indexOf(messageContent);
          await sock.sendMessage(id, { text: out[index] });
 
        } else if (containsInfo){

          const index = key.findIndex(item => messageContent.includes(item));
          await sock.sendMessage(id, { text: desc[index] });

        }
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
};

connectionLogic();