'use strict';

/**
 * All page numbers refer to pages in:
 * https://cdn.sparkfun.com/assets/learn_tutorials/4/1/9/BST-BME280_DS001-10.pdf
 *
 */
const u = require('./utils');

// rawlevel i2c read
exports.read = function (i2c, addr, length) {
  return new Promise((resolve, reject) => {
    i2c.transfer(new Buffer([ addr ]), length, (err, rx) => {
      if (err) return reject(err);
      // console.log('received:', addr, length, rx);
      resolve(rx);
    });
  });
};
// rawlevel ic2 send
exports.send = function (i2c, bytes) {
  return new Promise((resolve, reject) => {
    // console.log('raw send: sending', bytes, new Buffer(bytes));

    i2c.send(new Buffer(bytes), err => {
      if (err) return reject(err);
      resolve();
    });
  });
};

// page 24
exports.reset = function (i2c) {
  return exports.send(i2c, [0xE0, 0xB6]);
};

// page 22
exports.getCompensationParameters = function (i2c) {
  return Promise.all([
    exports.read(i2c, 0x88, 24),
    exports.read(i2c, 0xA1, 1),
    exports.read(i2c, 0xE1, 8)
  ]).then((bufs) => {
    const buf = bufs[0];
    const bufH1 = bufs[1];
    const bufH = bufs[2];
    const bufHPos4 = bufH.readInt8(4);

    const dig = {
      // temp
      T1: buf.readUInt16LE(0),
      T2: buf.readInt16LE(2),
      T3: buf.readInt16LE(4),
      // pressure
      P1: buf.readUInt16LE(6),
      P2: buf.readInt16LE(8),
      P3: buf.readInt16LE(10),
      P4: buf.readInt16LE(12),
      P5: buf.readInt16LE(14),
      P6: buf.readInt16LE(16),
      P7: buf.readInt16LE(18),
      //
      P8: u.signedConstrain(32, buf.readInt16LE(20)),
      P9: u.signedConstrain(32, buf.readInt16LE(22)),
      // humidity
      H1: u.unsignedConstrain(8, bufH1.readInt8(0)),
      H2: u.signedConstrain(32, bufH.readInt16LE(0)),
      H3: u.signedConstrain(32, bufH.readInt8(2)),
      H4: u.signedConstrain(32, (bufH.readInt8(3) << 4) | (bufHPos4 & 0xF)),
      H5: u.signedConstrain(32, (bufH.readInt8(5) << 4) | (bufHPos4 >> 4)),
      H6: u.signedConstrain(8, (bufH.readInt8(6)))
    };
    return dig;
  });
};

exports.ctrlHumidity = function (i2c) {
  return exports.send(i2c, [0xF2, 0x05]);
};

exports.ctrlTemperature = function (i2c) {
  return exports.send(i2c, [0xF4, 0xB7]);
};

exports.getMeasures = function (i2c) {
  return exports.read(i2c, 0xF7, 8)
    .then(buf => {
      return {
        P: u.signedConstrain(32, (buf.readUInt8(0) << 16) + (buf.readUInt8(1) << 8) + buf.readUInt8(2)),
        T: u.signedConstrain(32, (buf.readUInt8(3) << 16) + (buf.readUInt8(4) << 8) + buf.readUInt8(5)),
        H: u.signedConstrain(32, buf.readUInt16BE(6))
      };
    });
};

exports.calculate = function (measures, dig, offset, elevation) {
  let compensated = 0;
  let fine;
  let v1, v2, vx;

  const computed = {};

  const P = measures.P >> 4;
  const T = measures.T >> 4;
  const H = measures.H;
  // TEMPERATURE

  // Page 23
  // bmp280_compensate_T_int32
  // var1 = ((((adc_T>>3) – ((BMP280_S32_t)dig_T1<<1))) *
  //                        ((BMP280_S32_t)dig_T2)) >> 11;
  // var2 = (((((adc_T>>4) – ((BMP280_S32_t)dig_T1)) *
  //          ((adc_T>>4) – ((BMP280_S32_t)dig_T1))) >> 12) *
  //          ((BMP280_S32_t)dig_T3)) >> 14;
  //
  //
  const adc16 = T >> 4;
  const adc16subT1 = adc16 - dig.T1;
  v1  = (((T >> 3) - (dig.T1 << 1)) * dig.T2) >> 11;
  v2  = (((adc16subT1 * adc16subT1) >> 12) * dig.T3) >> 14;

  // t_fine = var1 + var2;
  fine = v1 + v2;

  // Page 7, 8
  // Table 2: Parameter specification
  //
  //
  // Temperature 0.01 °C
  //
  // As toFixed(2)
  //
  // C = +(((t_fine * 5 + 128) >> 8) / 100).toFixed(resolution)
  //
  computed.temperature = ((fine * 5 + 128) >> 8) / 100;

  // PRESSURE
  // Page 23
  // bmp280_compensate_P_int32
  //
  // Every single seemingly arbitrary magic number comes from the datasheet.
  // Datasheets are evidently written by people that don't care about
  // anyone else actually understanding how a thing works.
  //

  // var1 = (((BMP280_S32_t)t_fine)>>1) – (BMP280_S32_t)64000;
  v1 = u.signedConstrain(32, fine >> 1) - 64000;

  // var2 = (((var1>>2) * (var1>>2)) >> 11 ) * ((BMP280_S32_t)dig_P6);
  v2 = (((v1 >> 2) * (v1 >> 2)) >> 11) * u.signedConstrain(32, dig.P6);

  // var2 = var2 + ((var1*((BMP280_S32_t)dig_P5))<<1);
  v2 += (v1 * u.signedConstrain(32, dig.P5)) << 1;

  // var2 = (var2>>2)+(((BMP280_S32_t)dig_P4)<<16);
  v2 = (v2 >> 2) + (u.signedConstrain(32, dig.P4) << 16);


  // var1 = (((dig_P3 * (((var1>>2) * (var1>>2)) >> 13 )) >> 3) +
  //          ((((BMP280_S32_t)dig_P2) * var1)>>1))>>18;
  v1 = (((dig.P3 * (((v1 >> 2) * (v1 >> 2)) >> 13)) >> 3) + ((u.signedConstrain(32, dig.P2) * v1) >> 1)) >> 18;

  // var1 =((((32768+var1))*((BMP280_S32_t)dig_P1))>>15);
  v1 = (((u.pow2(15) + v1) * u.signedConstrain(32, dig.P1)) >> 15);

  if (v1 === 0) {
    // Prevent division by zero
    return 0;
  }

  // p = (((BMP280_U32_t)(((BMP280_S32_t)1048576)-adc_P)-(var2>>12)))*3125;
  compensated = u.unsignedConstrain(32, (u.signedConstrain(32, u.pow2(20)) - P) - (v2 >> 12)) * 3125;

  if (compensated < u.pow2(31)) {
    // p = (p << 1) / ((BMP280_U32_t)var1);
    compensated = ((compensated << 1) >>> 0) / u.unsignedConstrain(32, v1);
  } else {
    // p = (p / (BMP280_U32_t)var1) * 2;
    compensated = ((compensated / u.unsignedConstrain(32, v1)) >>> 0) * 2;
  }

  compensated = u.unsignedConstrain(32, compensated) >>> 0;

  // var1 = (((BMP280_S32_t)dig_P9) * ((BMP280_S32_t)(((p>>3) * (p>>3))>>13)))>>12;
  const compshift3r = compensated >> 3;
  v1 = (u.signedConstrain(32, dig.P9) * u.signedConstrain(32, ((compshift3r * compshift3r) >> 13))) >> 12;

  // var2 = (((BMP280_S32_t)(p>>2)) * ((BMP280_S32_t)dig_P8))>>13;
  v2 = (u.signedConstrain(32, compensated >> 2) * dig.P8) >> 13;

  // p = (BMP280_U32_t)((BMP280_S32_t)p + ((var1 + var2 + dig_P7) >> 4));
  compensated = u.unsignedConstrain(32, u.signedConstrain(32, compensated) + ((v1 + v2 + dig.P7) >> 4));

  // Steps of 1Pa (= 0.01hPa = 0.01mbar) (=> 0.001kPa)
  computed.pressure = compensated / 1000;

  // Calculating pressure at sea level (copied from BMP180)
  const seapress = compensated / Math.pow(1 - elevation * 0.0000225577, 5.255);
  const altitude = 44330 * (1 - Math.pow(compensated / seapress, 1 / 5.255));

  // Page 3
  // ...relative accuracy is ±0.12 hPa, which is equivalent to
  // ±1 m difference in altitude.
  computed.altitude = Math.round(altitude - offset);


  // Page 23, 24
  // BME280_U32_t bme280_compensate_H_int32(BME280_S32_t adc_H)

  // BME280_S32_t v_x1_u32r;
  // v_x1_u32r = (t_fine – ((BME280_S32_t)76800));
  vx = u.signedConstrain(32, fine - 76800);

  // v_x1_u32r = (((((adc_H << 14) – (((BME280_S32_t)dig_H4) << 20) – (((BME280_S32_t)dig_H5) * v_x1_u32r)) +
  // ((BME280_S32_t)16384)) >> 15) * (((((((v_x1_u32r * ((BME280_S32_t)dig_H6)) >> 10) * (((v_x1_u32r * ((BME280_S32_t)dig_H3)) >> 11) + ((BME280_S32_t)32768))) >> 10) + ((BME280_S32_t)2097152)) *
  // ((BME280_S32_t)dig_H2) + 8192) >> 14));

  vx = (((((H << 14) - u.signedConstrain(32, dig.H4 << 20) - (dig.H5 * vx)) + u.pow2(14)) >> 15) *
        (((((((vx * dig.H6) >> 10) * (((vx * dig.H3) >> 11) + u.pow2(15))) >> 10) + u.pow2(21)) * dig.H2 + u.pow2(13)) >> 14));

  // v_x1_u32r = (v_x1_u32r - (((((v_x1_u32r >> 15) * (v_x1_u32r >> 15)) >> 7) * ((int32_t)_bme280_calib.dig_H1)) >> 4));
  vx -= (((((vx >> 15) * (vx >> 15)) >> 7) * u.signedConstrain(32, dig.H1) >> 4));

  // v_x1_u32r = (v_x1_u32r < 0 ? 0 : v_x1_u32r);
  // v_x1_u32r = (v_x1_u32r > 419430400 ? 419430400 : v_x1_u32r);
  vx = u.constrain(vx, 0, 419430400);

  computed.humidity = Math.round((u.unsignedConstrain(32, vx >> 12)) * 100 / 1024) /100;
  return computed;
};