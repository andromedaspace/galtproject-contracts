const Ganache = require('ganache-core');
const _ = require('lodash');

const config = {
  networks: {
    development: {
      host: '127.0.0.1',
      port: 7545,
      network_id: '*'
    },
    test: {
      provider: Ganache.provider({
        unlocked_accounts: [0, 1, 2, 3, 4, 5]
      }),
      network_id: '*'
    }
  },
  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    }
  }
};

if (process.env.USE_GAS_REPORTER === 'yes') {
  _.merge(config, {
    mocha: {
      reporter: 'eth-gas-reporter',
      reporterOptions: {
        currency: 'USD',
        gasPrice: 21
      }
    }
  });
}

module.exports = config;
