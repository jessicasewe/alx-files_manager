const Queue = require('bull');
const imageThumb = require('image-thumbnail');
const { ObjectId } = require('mongodb');
const fs = require('fs');
const dbClient = require('./utils/db');

const fileQueue = new Queue('fileQueue');
const userQueue = new Queue('userQueue');

fileQueue.process(async (job) => {
  try {
    const { fileId, userId } = job.data;
    if (!fileId) {
      throw new Error('Missing fileId');
    }

    if (!userId) throw new Error('Missing userId');

    const file = await dbClient.filesCollection.findOne({
      _id: ObjectId(fileId),
      userId: ObjectId(userId),
    });
    if (!file) throw new Error('File not found');
    const path = file.localPath;
    fs.writeFileSync(`${path}_500`, await imageThumb(path, { width: 500 }));

    fs.writeFileSync(`${path}_250`, await imageThumb(path, { width: 250 }));

    fs.writeFileSync(`${path}_100`, await imageThumb(path, { width: 100 }));
  } catch (error) {
    console.error('An error occurred:', error);
  }
});

userQueue.process(async (job) => {
  try {
    const { userId } = job.data;
    if (!userId) throw new Error('Missing userId');
    const user = await dbClient.usersCollection.findOne({ _id: ObjectId(userId) });
    if (!user) throw new Error('User not found');

    console.log(`Welcome ${user.email}!`);
  } catch (error) {
    console.error('An error occurred:', error);
  }
});

module.exports = { fileQueue, userQueue };
