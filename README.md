# litepoll

Free polls for every man, woman, child, and politician on Earth.

[![Build Status](https://travis-ci.org/schmich/litepoll.svg?branch=master)](https://travis-ci.org/schmich/litepoll)
[![Dependency Status](https://gemnasium.com/schmich/litepoll.svg)](https://gemnasium.com/schmich/litepoll)

## Development

- [Install MongoDB](https://www.mongodb.org/downloads)
- [Install Redis](http://redis.io/download)
- [Install NodeJS](http://nodejs.org/dist/), v0.11.14+
- Install `node-gyp`: `npm install -g node-gyp`
- Clone repo: `git clone git@github.com:schmich/litepoll`
- Install dependencies: `npm install`
- Run the server
 - `mongod`
 - `redis-server`
 - `npm start`
 - [http://localhost:3000](http://localhost:3000)
- Run tests
 - `npm install -g mocha`
 - `mongod`
 - `redis-server`
 - `npm test`
