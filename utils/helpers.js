// utils/helpers.js
const redisClient = require('./redis');
const dbClient = require('./db');

async function findUserIdByToken(request) {
  const token = request.headers['x-token'];
  if (!token) {
    return null;
  }
  const userId = await redisClient.get(`auth_${token}`);
  if (!userId) {
    return null;
  }
  return userId;
}

module.exports = { findUserIdByToken };
