require('dotenv').config();
const SqliteAdapter = require('./sqliteAdapter');
const SupabaseAdapter = require('./supabaseAdapter');

let activeAdapter = null;

function getDatabaseAdapter() {
  if (activeAdapter) return activeAdapter;

  const dbType = (process.env.DB_TYPE || '').toLowerCase();
  const hasSupabase = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY));

  if (dbType === 'sqlite' || (!hasSupabase && dbType !== 'supabase')) {
    console.log('[DB] Using SQLite Database Adapter (pushwing.db)');
    activeAdapter = new SqliteAdapter();
  } else {
    try {
      console.log(`[DB] Using Supabase PostgreSQL Adapter (${process.env.SUPABASE_URL})`);
      activeAdapter = new SupabaseAdapter();
    } catch (err) {
      console.warn('[DB] Failed to initialize SupabaseAdapter, falling back to SQLite:', err.message);
      activeAdapter = new SqliteAdapter();
    }
  }

  return activeAdapter;
}

const db = getDatabaseAdapter();

module.exports = db;
