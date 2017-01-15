const utils = require('../../lib/utils');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const chai = require('chai');
const expect = chai.expect;

chai.use(sinonChai);

describe('utils', function () {
  describe('#pow2(val)', function () {
    beforeEach(function () {
      sinon.spy(Math, 'pow');
    });
    afterEach(function () {
      Math.pow.restore();
    });
    it('should return the 2^val', function () {
      expect(utils.pow2(4)).to.eq(16);
      expect(utils.pow2(8)).to.eq(256);
    });
    it('should memoize the result', function () {
      expect(utils.pow2(3)).to.eq(8);
      expect(utils.pow2(3)).to.eq(8);
      expect(Math.pow).to.have.callCount(1);
    });
  });
  describe('#constain(value, min, max)', function () {
    it('will constrain a value inside a low and high value', function () {
      expect(utils.constrain(5, -10, 10)).to.eq(5);
      expect(utils.constrain(-10, -10, 10)).to.eq(-10);
      expect(utils.constrain(-11, -10, 10)).to.eq(-10);
      expect(utils.constrain(10, -10, 10)).to.eq(10);
      expect(utils.constrain(11, -10, 10)).to.eq(10);
    });
  });
  describe('#signedConstrain(byte, value)', function () {
    it('will constrain a value to a signed valueof that bit size', function () {
      expect(utils.signedConstrain(8, 100)).to.eq(100);
      expect(utils.signedConstrain(8, 128)).to.eq(-128);
      expect(utils.signedConstrain(8, 127)).to.eq(127);
      expect(utils.signedConstrain(8, 255)).to.eq(-1);
    });
  });
  describe('#unsignedConstrain(byte, value)', function () {
    it('will constrain a value to a signed valueof that bit size', function () {
      expect(utils.unsignedConstrain(8, 255)).to.eq(255);
      expect(utils.unsignedConstrain(8, 256)).to.eq(255);
      expect(utils.unsignedConstrain(8, -256)).to.eq(0);
      expect(utils.unsignedConstrain(8, -255)).to.eq(1);
      expect(utils.unsignedConstrain(8, -254)).to.eq(2);
    });
  });
});