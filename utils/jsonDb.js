const fs = require('fs').promises;
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

async function readJson(fileName) {
  const filePath = path.join(dataDir, fileName);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    if (!content.trim()) return [];
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

async function writeJson(fileName, data) {
  const filePath = path.join(dataDir, fileName);
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, content, 'utf8');
}

async function getNextId(fileName, idField) {
  const items = await readJson(fileName);
  if (items.length === 0) return 1;
  const maxId = items.reduce((max, item) => {
    return item[idField] > max ? item[idField] : max;
  }, 0);
  return maxId + 1;
}

module.exports = {
  readJson,
  writeJson,
  getNextId
};
