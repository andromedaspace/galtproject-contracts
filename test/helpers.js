const Web3 = require('web3');

const { BN } = Web3.utils;

let web3;

module.exports = {
  initHelperWeb3(_web3) {
    web3 = new Web3(_web3.currentProvider);
  },
  zeroAddress: '0x0000000000000000000000000000000000000000',
  hex(input) {
    return web3.utils.toHex(input);
  },
  gwei(number) {
    return web3.utils.toWei(number.toString(), 'gwei');
  },
  szabo(number) {
    return web3.utils.toWei(number.toString(), 'szabo');
  },
  ether(number) {
    return web3.utils.toWei(number.toString(), 'ether');
  },
  galt(number) {
    return web3.utils.toWei(number.toString(), 'ether');
  },
  roundToPrecision(number, precision = 4) {
    return Math.round(number / 10 ** precision) * 10 ** precision;
  },
  log(...args) {
    console.log('>>>', new Date().toLocaleTimeString(), '>>>', ...args);
  },
  async sleep(timeout) {
    return new Promise(resolve => {
      setTimeout(resolve, timeout);
    });
  },
  async assertRevert(promise) {
    try {
      await promise;
    } catch (error) {
      const revert = error.message.search('revert') >= 0;
      assert(revert, `Expected throw, got '${error}' instead`);
      return;
    }
    assert.fail('Expected throw not received');
  },
  assertEqualBN(actual, expected) {
    assert(actual instanceof BN);
    assert(expected instanceof BN);

    assert(
      actual.toString(10) === expected.toString(10),
      `Expected ${web3.utils.fromWei(actual)} (actual) ether to be equal ${web3.utils.fromWei(
        expected
      )} ether (expected)`
    );
  },
  async printStorage(address, slotsToPrint) {
    assert(typeof address !== 'undefined');
    assert(address.length > 0);

    console.log('Storage listing for', address);
    const tasks = [];

    for (let i = 0; i < (slotsToPrint || 20); i++) {
      tasks.push(web3.eth.getStorageAt(address, i));
    }

    const results = await Promise.all(tasks);

    for (let i = 0; i < results.length; i++) {
      console.log(`slot #${i}`, results[i]);
    }
  }
};
