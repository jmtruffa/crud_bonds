require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Storage } = require('@google-cloud/storage');

const GCS_BUCKET = process.env.GCS_BUCKET;
let gcsBucket = null;

if (GCS_BUCKET) {
  const gcsOpts = {};
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    gcsOpts.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  const gcs = new Storage(gcsOpts);
  gcsBucket = gcs.bucket(GCS_BUCKET);
}

function printGcsConfig() {
  if (GCS_BUCKET) {
    console.log(`   GCS Bucket: ${GCS_BUCKET}`);
    console.log(`   GCS Credentials: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || 'Application Default Credentials'}`);
  } else {
    console.log('   GCS Bucket: NOT configured (set GCS_BUCKET in .env)');
  }
}

module.exports = { gcsBucket, printGcsConfig };
