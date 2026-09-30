const express = require('express');
const cookieParser = require('cookie-parser');
const { authRouter } = require('./auth');
const { bookingRouter } = require('./booking');
const { adminRouter } = require('./admin');

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter(db));
  app.use('/api', bookingRouter(db));
  app.use('/api/admin', adminRouter(db));
  app.use(express.static('public'));
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

module.exports = { createApp };
