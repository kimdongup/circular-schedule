const express = require('express');
const path = require('path');
const { customAlphabet } = require('nanoid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 6);

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
  });
});

app.get('/api/generate-id', (req, res) => {
  res.json({ id: nanoid() });
});

app.get('/s/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Render Web Service running on http://${HOST}:${PORT}`);
});