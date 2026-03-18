require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const OpenAI = require('openai');

let openai = null;
if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('PEGA_TU_KEY')) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function printOpenaiConfig() {
  console.log(`   OpenAI: ${openai ? 'configured' : 'NOT configured (set OPENAI_API_KEY in .env)'}`);
}

module.exports = { openai, printOpenaiConfig };
