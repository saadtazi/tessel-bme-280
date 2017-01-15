const tessel = require('tessel');
const BME280 = require('../lib'); // require('tessel-bme-280');

// Connect to device
var port = tessel.port.A; // Use the SCL/SDA pins of Port A

bme = new BME280(port);
bme.on('data', data => console.log('from evnt:', data));
bme.every(1000, data => console.log('from cb:', data));
setTimeout(_ => {
    console.log('stopping');
    bme.stop();
}, 15000);

function measure(when) {
    setTimeout(_ => bme.measure(
        (err, data) => console.log(when, ': from CB: measure, ', data)
    ).then(
        data => console.log(when, ': from PROMISE: measure, ', data)
    ).catch(
        err => console.log(when, ': error', err)
    ), when);
}

measure(1);

