const { ObjectId } = require('mongodb');
const crypto = require('crypto');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');
const userQueue = require('../worker');

const postNew = async (req, res) => {
  const { email, password } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  if (!password) {
    return res.status(400).json({ error: 'Missing password' });
  }

  try {
    const existingUser = await dbClient.usersCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Already exist' });
    }

    const hashedPassword = crypto.createHash('sha1').update(password).digest('hex');
    const newUser = { email, password: hashedPassword };

    const result = await dbClient.usersCollection.insertOne(newUser);

    const createdUser = {
      id: result.insertedId,
      email,
    };
    userQueue.add({ userId: result.insertedId });
    return res.status(201).json(createdUser);
  } catch (error) {
    console.error('Error creating new user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const getMe = async (req, res) => {
  try {
    const token = req.header('X-Token');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userIdObj = new ObjectId(userId);
    const user = await dbClient.usersCollection.findOne({ _id: userIdObj });

    if (user) return res.status(200).json({ id: userId, email: user.email });
    return res.status(401).json({ error: 'Unauthorized' });
  } catch (error) {
    console.error('Error retrieving user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  postNew,
  getMe,
};
