'use strict';

const memoize = require('lodash/memoize');

// some utils
function _pow2(num) {
  return Math.pow(2, num);
}

const pow2 = memoize(_pow2);

function constrain(value, lower, upper) {
  return Math.min(upper, Math.max(lower, value));
};

function signedConstrain(bytes, value) {
  const decimal = pow2(bytes);
  const half = (decimal / 2 >>> 0);
  const halfMinusOne = half - 1;
  if (value > halfMinusOne) {
    value -= decimal;
  }
  return constrain(value, -half, halfMinusOne);
};

function unsignedConstrain(bytes, value) {
  const decimal = pow2(bytes);
  if (value < 0) {
    value += decimal;
  }
  return constrain(value, 0, decimal - 1);
}

module.exports = {
    pow2,
    constrain,
    signedConstrain,
    unsignedConstrain
};