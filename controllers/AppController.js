const redisClient = require('../utils/redis');
const dbClient = require('../utils/db');

function getStatus(req, res) {
  const redisStatus = redisClient.isAlive();
  const dbStatus = dbClient.isAlive();

  res.status(200).json({ redis: redisStatus, db: dbStatus });
}

async function getStats(req, res) {
  try {
    const users = await dbClient.nbUsers();
    const files = await dbClient.nbFiles();

    res.status(200).json({ users, files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getStatus,
  getStats,
};
