'use strict';

const EventEmitter = require('events');
const util = require('util');
const io = require('./io');

const defaults = {
  //from https://github.com/emcniece/tessel-bme280/blob/master/index.js;
  slaveAddress: 0x77
};

function BME280(port, opts) {
  // Initialize necessary properties from `EventEmitter` in this instance
  EventEmitter.call(this);

  opts = opts || {};

  this.slaveAddress = opts.slaveAddress || defaults.slaveAddress;
  if (!port) {
    throw new Error('please provide a tessel port');
  }

  this.elevation = null;
  this.offset = 0;

  if (typeof opts.elevation !== 'undefined') {
    this.elevation = opts.elevation;
  }

  if ((this.elevation != null && this.elevation <= 0) ||
      this.elevation == null) {
    this.offset = Math.abs(this.elevation) + 1;
    this.elevation = 1;
  }
  this.i2c = new port.I2C(this.slaveAddress);
}

// Inherit functions from `EventEmitter`'s prototype
util.inherits(BME280, EventEmitter);


BME280.prototype.initialize = function () {
  // only once
  if (this.initialized) {
    return this.initialized;
  }
  let dig;
  this.initialized = io.reset(this.i2c)
  .then(() => {
    return io.getCompensationParameters(this.i2c);
  })
  .then(d => {
    dig = d;
  })
  .then(() => {
    return Promise.all([
      io.ctrlHumidity(this.i2c),
      io.ctrlTemperature(this.i2c)
    ]);
  })
  .then(_ => dig)
  return this.initialized;
};

BME280.prototype.measure = function (cb) {
  return this.initialize()
    .then(dig => {
      return this._measure(dig, false, cb);
    });
};

BME280.prototype._measure = function (dig, rethrow, cb) {
  return io.getMeasures(this.i2c)
  .then(measures => {
    const res = io.calculate(measures, dig, this.offset, this.elevation);
    this.emit('data', res);
    cb && cb(null, res);
    return res;
  })
  .catch(this.handleError.bind(this, rethrow, cb));
}

BME280.prototype._measureInfinitely = function (dig, delay, cb) {
  if (this.started) {
    this._measure(dig, true, cb).then(_ => {
      setTimeout(_ => {
        if (this.started) {
          this._measureInfinitely(dig, delay, cb);
        }
      }, delay);
    });
  }
};

BME280.prototype.every = function (delay, cb) {
  this.started = true;
  return this.initialize()
    .then(dig => {
      this._measureInfinitely(dig, delay, cb);
    });
};

BME280.prototype.stop = function () {
  this.timeout && clearTimeout(this.timeout);
  this.started = false;
};

BME280.prototype.handleError = function (err, shouldRethrow, cb) {
  this.emit('error', err);
  if (shouldRethrow) throw err;
  if (cd) cb(err);
}

module.exports = BME280;