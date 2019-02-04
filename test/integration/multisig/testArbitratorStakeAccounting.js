const GaltToken = artifacts.require('./GaltToken.sol');
const ArbitratorStakeAccounting = artifacts.require('./MockArbitratorStakeAccounting.sol');
const AddressLinkedList = artifacts.require('./AddressLinkedList.sol');
const VotingLinkedList = artifacts.require('./VotingLinkedList.sol');
const Web3 = require('web3');
const { assertRevert, ether, initHelperWeb3 } = require('../../helpers');

const { utf8ToHex } = Web3.utils;
const bytes32 = utf8ToHex;
const web3 = new Web3(GaltToken.web3.currentProvider);

initHelperWeb3(web3);

// eslint-disable-next-line no-underscore-dangle
const _ES = bytes32('');
const MN = bytes32('MN');
const BOB = bytes32('Bob');
const CHARLIE = bytes32('Charlie');
const DAN = bytes32('Dan');
const EVE = bytes32('Eve');

contract('ArbitratorStakeAccounting', accounts => {
  const [coreTeam, slashManager, multiSig, alice, bob] = accounts;

  beforeEach(async function() {
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.arbitratorStakeAccountingX = await ArbitratorStakeAccounting.new(this.galtToken.address, multiSig, 60, {
      from: coreTeam
    });

    this.arbitratorStakeAccountingX.addRoleTo(slashManager, 'slash_manager');

    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });
    await this.galtToken.mint(bob, ether(10000000), { from: coreTeam });

    this.mX = multiSig;
  });

  describe('#stake()', () => {
    it('should allow any address stake in GALT', async function() {
      await this.galtToken.approve(this.arbitratorStakeAccountingX.address, ether(35), { from: alice });

      await this.arbitratorStakeAccountingX.stake(bob, ether(35), { from: alice });

      let res = await this.arbitratorStakeAccountingX.balanceOf(bob);
      assert.equal(res, ether(35));

      res = await this.galtToken.balanceOf(multiSig);
      assert.equal(res, ether(35));

      // add some more deposit
      await this.galtToken.approve(this.arbitratorStakeAccountingX.address, ether(10), { from: bob });
      await this.arbitratorStakeAccountingX.stake(bob, ether(10), { from: bob });

      res = await this.arbitratorStakeAccountingX.balanceOf(bob);
      assert.equal(res, ether(45));

      res = await this.galtToken.balanceOf(multiSig);
      assert.equal(res, ether(45));
    });
  });

  describe('#slash()', () => {
    beforeEach(async function() {
      await this.galtToken.approve(this.arbitratorStakeAccountingX.address, ether(35), { from: alice });
      await this.arbitratorStakeAccountingX.stake(bob, ether(35), { from: alice });
    });

    it('should allow slash manager slashing arbitrator stake', async function() {
      await this.arbitratorStakeAccountingX.slash(bob, ether(18), { from: slashManager });

      const res = await this.arbitratorStakeAccountingX.balanceOf(bob);
      assert.equal(res, ether(17));
    });

    it('should deny non-slashing manager slashing stake', async function() {
      await assertRevert(this.arbitratorStakeAccountingX.slash(bob, ether(10), { from: bob }));
    });

    it('should deny slashing with a value grater than current stake', async function() {
      await assertRevert(this.arbitratorStakeAccountingX.slash(bob, ether(36), { from: slashManager }));
    });
  });

  describe('#getCurrentPeriod()', () => {
    it('should provide correct period ID', async function() {
      // DANGER: could fail since we don't count the execution time
      let res = await web3.eth.getBlock('latest');
      const latestBlockTimestamp = res.timestamp;
      await this.arbitratorStakeAccountingX.setInitialTimestamp(latestBlockTimestamp);
      res = await this.arbitratorStakeAccountingX.getInitialTimestamp();
      assert.equal(res, latestBlockTimestamp);
      res = await this.arbitratorStakeAccountingX.getCurrentPeriod();
      assert.equal(res, 0);

      await this.arbitratorStakeAccountingX.setInitialTimestamp(latestBlockTimestamp - 59);
      res = await this.arbitratorStakeAccountingX.getCurrentPeriod();
      assert.equal(res, 0);

      await this.arbitratorStakeAccountingX.setInitialTimestamp(latestBlockTimestamp - 60);
      res = await this.arbitratorStakeAccountingX.getCurrentPeriod();
      assert.equal(res, 1);

      await this.arbitratorStakeAccountingX.setInitialTimestamp(latestBlockTimestamp - 61);
      res = await this.arbitratorStakeAccountingX.getCurrentPeriod();
      assert.equal(res, 1);

      await this.arbitratorStakeAccountingX.setInitialTimestamp(latestBlockTimestamp - 119);
      res = await this.arbitratorStakeAccountingX.getCurrentPeriod();
      assert.equal(res, 1);

      await this.arbitratorStakeAccountingX.setInitialTimestamp(latestBlockTimestamp - 120);
      res = await this.arbitratorStakeAccountingX.getCurrentPeriod();
      assert.equal(res, 2);

      await this.arbitratorStakeAccountingX.setInitialTimestamp(latestBlockTimestamp - 121);
      res = await this.arbitratorStakeAccountingX.getCurrentPeriod();
      assert.equal(res, 2);
    });
  });
});
