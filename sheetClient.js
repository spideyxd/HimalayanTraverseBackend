const { google } = require('googleapis');
const path = require('path');
const keyPath = path.join(__dirname, '../htb/secret.json');
const key = require(keyPath);
const SHEET_ID = '1aTHWpwoD6EcA46Z1Xu4jEoPP7x2AKIOb5MMmx0m_SAs';

const client = new google.auth.JWT(key.client_email, null, key.private_key, [
  'https://www.googleapis.com/auth/spreadsheets',
]);
const sheets = google.sheets({ version: 'v4', auth: client });

module.exports = {
  sheets,
  SHEET_ID,
};
