import redisClient from '../utils/redis';
import dbClient from '../utils/db';

exports.getStatus = async (req, res) => {
  const redisAlive = redisClient.isAlive();
  const dbAlive = dbClient.isAlive();
  res.status(200).json({ redis: redisAlive, db: dbAlive });
};

exports.getStats = async (req, res) => {
  try {
    const usersCount = await dbClient.nbUsers();
    const filesCount = await dbClient.nbFiles();
    res.status(200).json({ users: usersCount, files: filesCount });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve stats' });
  }
};
