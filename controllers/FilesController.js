const fs = require('fs');
const { v4: uuid4 } = require('uuid');
const path = require('path');
const { ObjectId } = require('mongodb');
const mime = require('mime-types');
const redisClient = require('../utils/redis');
const dbClient = require('../utils/db');
const fileQueue = require('../worker');

class FileController {
  static async postUpload(req, res) {
    const token = req.header('X-Token');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      console.log(`User ID not found for token ${token}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      name, type, isPublic, data,
    } = req.body;
    const parentId = req.body.parentId || '0';

    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }
    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }
    if (!data && type !== 'folder') {
      return res.status(400).json({ error: 'Missing data' });
    }

    if (parentId !== '0') {
      const parentFile = await dbClient.filesCollection.findOne({ _id: ObjectId(parentId) });
      if (!parentFile) return res.status(400).json({ error: 'Parent not found' });
      if (parentFile.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
    }

    const folderData = {
      userId: ObjectId(userId),
      name,
      type,
      isPublic: isPublic || false,
      parentId: parentId === '0' ? 0 : ObjectId(parentId),
    };

    if (type === 'folder') {
      const newFolder = await dbClient.filesCollection.insertOne({
        userId, name, type, isPublic: isPublic || false, parentId,
      });
      folderData.parentId = parentId === '0' ? 0 : ObjectId(parentId);
      return res.status(201).json({ id: newFolder.insertedId, ...folderData });
    }

    const folderName = process.env.FOLDER_PATH || '/tmp/files_manager';
    const fileId = uuid4();
    const localPath = path.join(folderName, fileId);

    await fs.promises.mkdir(folderName, { recursive: true });
    await fs.promises.writeFile(localPath, Buffer.from(data, 'base64'));

    const newFile = await dbClient.filesCollection.insertOne({ localPath, ...folderData });

    if (type === 'image') {
      fileQueue.add({ fileId: newFile.insertedId, userId });
    }

    folderData.parentId = parentId === '0' ? 0 : ObjectId(parentId);
    return res.status(201).json({ id: newFile.insertedId, localPath, ...folderData });
  }

  static async getShow(req, res) {
    const token = req.header('X-Token');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const file = await dbClient.filesCollection.findOne({
      _id: ObjectId(fileId),
      userId: ObjectId(userId),
    });
    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(200).json(file);
  }

  static async getIndex(req, res) {
    const token = req.header('X-Token');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const stringUserId = await redisClient.get(`auth_${token}`);
    if (!stringUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parentId = req.query.parentId ? ObjectId(req.query.parentId) : '0';
    const userId = ObjectId(stringUserId);
    const filesCount = await dbClient.nbFiles({ userId, parentId });

    if (filesCount === '0') return res.json([]);

    const page = parseInt(req.query.page, 10) || 0;
    const filesPerPage = 20;
    const files = await dbClient.filesCollection.find({ userId: ObjectId(userId), parentId: parentId === '0' ? 0 : ObjectId(parentId) })
      .skip(page * filesPerPage)
      .limit(filesPerPage)
      .toArray();

    const transformedFiles = files.map((file) => ({
      id: file._id.toString(),
      userId: file.userId.toString(),
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId === 0 ? 0 : file.parentId.toString(),
    }));

    return res.status(200).json(transformedFiles);
  }

  static async putPublish(req, res) {
    const token = req.header('X-Token');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const file = await dbClient.filesCollection.findOne({
      _id: ObjectId(fileId),
      userId: ObjectId(userId),
    });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    await dbClient.filesCollection.updateOne({ _id: ObjectId(fileId) },
      { $set: { isPublic: true } });

    return res.status(200).json({ id: fileId, isPublic: true });
  }

  static async putUnpublish(req, res) {
    const token = req.header('X-Token');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const file = await dbClient.filesCollection.findOne({
      _id: ObjectId(fileId),
      userId: ObjectId(userId),
    });
    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    await dbClient.filesCollection.updateOne({ _id: ObjectId(fileId) },
      { $set: { isPublic: false } });

    return res.status(200).json({ id: fileId, isPublic: false });
  }

  static async getFile(req, res) {
    const token = req.header('X-Token');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const file = await dbClient.filesCollection.findOne({ _id: ObjectId(fileId) });
    const stringUserId = file.userId.toString();
    if (!file || (!file.isPublic && (!userId || userId !== stringUserId))) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (file.type === 'folder') {
      return res.status(400).json({ error: 'A folder doesn\'t have content' });
    }

    let { localPath } = file;
    const { size } = req.query;

    if (size) localPath = `${localPath}_${size}`;

    if (!fs.existsSync(localPath)) {
      return res.status(404).json({ error: 'Not found' });
    }

    res.setHeader('Content-Type', mime.lookup(file.name));
    return res.sendFile(localPath);
  }
}

module.exports = FileController;
