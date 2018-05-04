const mongoose = require('mongoose');
const redis = require('redis');
const util = require('util');
const keys = require('../config/keys');

const client = redis.createClient(keys.redisUrl);
client.hget = util.promisify(client.hget);

const exec = mongoose.Query.prototype.exec;

mongoose.Query.prototype.cache = function(options = {}) {
  this.hashKey = JSON.stringify(options.key || '');
  this.useCache = true;
  return this;
};
mongoose.Query.prototype.exec = async function() {
  console.log('About to make a Query');
  if (!this.useCache) {
    return exec.apply(this, arguments);
  }
  const key = Object.assign({}, this.getQuery(), {
    collection: this.mongooseCollection.name
  });
  //see if we have value for key in cache
  const cacheValue = await client.hget(this.hashKey, key);

  if (cacheValue) {
    const doc = JSON.parse(cacheValue);

    return Array.isArray(doc)
      ? doc.map(d => new this.model(d))
      : new this.model(doc);
  }
  const result = await exec.apply(this, arguments);
  // console.log(result);
  client.hset(this.hashKey, key, JSON.stringify(result));
  client.expire(this.hashKey, 10);

  return result;
};

module.exports = {
  clearHash(hashKey) {
    client.del(JSON.stringify(hashKey));
  }
};
