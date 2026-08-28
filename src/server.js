const app = require('./app');
const vapid = require('./vapid');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🚀 Pushwing Web Push Server running on port ${PORT}`);
  console.log(`🔑 VAPID Public Key: ${vapid.publicKey}`);
  console.log(`🌐 Web Console / Client: http://localhost:${PORT}`);
  console.log('====================================================');
});
