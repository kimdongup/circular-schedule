require('dotenv').config();
const SupabaseAdapter = require('./supabaseAdapter');

module.exports = new SupabaseAdapter();
