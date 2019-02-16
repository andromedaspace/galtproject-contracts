const Oracles = artifacts.require('./Oracles.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const OracleStakesAccounting = artifacts.require('./OracleStakesAccounting.sol');
const ArbitratorVoting = artifacts.require('./ArbitratorVoting.sol');
const ArbitrationConfig = artifacts.require('./ArbitrationConfig.sol');
const Web3 = require('web3');
const { assertRevert, ether, initHelperWeb3 } = require('../../helpers');

const { utf8ToHex } = Web3.utils;
const bytes32 = utf8ToHex;
const web3 = new Web3(Oracles.web3.currentProvider);

initHelperWeb3(web3);

const NEW_APPLICATION = '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6';
const ESCROW_APPLICATION = '0xf17a99d990bb2b0a5c887c16a380aa68996c0b23307f6633bd7a2e1632e1ef48';
const CUSTODIAN_APPLICATION = '0xe2ce825e66d1e2b4efe1252bf2f9dc4f1d7274c343ac8a9f28b6776eb58188a6';

const NON_EXISTENT_ROLE = bytes32('blah');
const PE_AUDITOR_ORACLE_TYPE = bytes32('PE_AUDITOR_ORACLE_TYPE');
const PC_CUSTODIAN_ORACLE_TYPE = bytes32('PC_CUSTODIAN_ORACLE_TYPE');
const PC_AUDITOR_ORACLE_TYPE = bytes32('PC_AUDITOR_ORACLE_TYPE');

const FOO = bytes32('foo');
const BAR = bytes32('bar');
const BUZZ = bytes32('buzz');
// eslint-disable-next-line no-underscore-dangle
const _ES = bytes32('');
const MN = bytes32('MN');
const BOB = bytes32('Bob');
const CHARLIE = bytes32('Charlie');
const DAN = bytes32('Dan');
const EVE = bytes32('Eve');

// NOTICE: we don't wrap MockToken with a proxy on production
contract('OracleStakesAccounting', accounts => {
  const [
    coreTeam,
    slashManager,
    applicationTypeManager,
    oracleManager,
    multiSig,
    spaceReputationAccountingAddress,
    zeroAddress,
    alice,
    bob,
    charlie,
    dan,
    eve
  ] = accounts;

  beforeEach(async function() {
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.oracles = await Oracles.new({ from: coreTeam });

    this.config = await ArbitrationConfig.new(2, 3, ether(1000), [30, 30, 30, 30, 30], { from: coreTeam });
    this.arbitratorVoting = await ArbitratorVoting.new(this.config.address, { from: coreTeam });
    this.oracleStakesAccountingX = await OracleStakesAccounting.new(
      this.oracles.address,
      this.galtToken.address,
      this.config.address,
      { from: coreTeam }
    );

    await this.arbitratorVoting.addRoleTo(
      this.oracleStakesAccountingX.address,
      await this.arbitratorVoting.ORACLE_STAKES_NOTIFIER(),
      {
        from: coreTeam
      }
    );

    this.config.initialize(
      multiSig,
      this.arbitratorVoting.address,
      zeroAddress,
      this.oracleStakesAccountingX.address,
      spaceReputationAccountingAddress
    );

    await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });

    this.mX = multiSig;

    await this.oracles.addRoleTo(applicationTypeManager, await this.oracles.ROLE_APPLICATION_TYPE_MANAGER(), {
      from: coreTeam
    });
    await this.oracles.addRoleTo(oracleManager, await this.oracles.ROLE_ORACLE_TYPE_MANAGER(), {
      from: coreTeam
    });
    await this.oracles.addRoleTo(oracleManager, await this.oracles.ROLE_ORACLE_MANAGER(), {
      from: coreTeam
    });
    await this.oracles.addRoleTo(oracleManager, await this.oracles.ROLE_ORACLE_STAKES_MANAGER(), {
      from: coreTeam
    });
    await this.oracles.addRoleTo(
      this.oracleStakesAccountingX.address,
      await this.oracles.ROLE_ORACLE_STAKES_NOTIFIER(),
      {
        from: coreTeam
      }
    );
    await this.oracleStakesAccountingX.addRoleTo(
      slashManager,
      await this.oracleStakesAccountingX.ROLE_SLASH_MANAGER(),
      {
        from: coreTeam
      }
    );

    await this.oracles.setApplicationTypeOracleTypes(NEW_APPLICATION, [FOO, BAR, BUZZ], [30, 30, 40], [_ES, _ES, _ES], {
      from: applicationTypeManager
    });
    await this.oracles.setApplicationTypeOracleTypes(ESCROW_APPLICATION, [PE_AUDITOR_ORACLE_TYPE], [100], [_ES], {
      from: applicationTypeManager
    });
    this.resClarificationAddRoles = await this.oracles.setApplicationTypeOracleTypes(
      CUSTODIAN_APPLICATION,
      [PC_CUSTODIAN_ORACLE_TYPE, PC_AUDITOR_ORACLE_TYPE],
      [60, 40],
      [_ES, _ES],
      { from: applicationTypeManager }
    );

    // assign oracles
    await this.oracles.addOracle(this.mX, bob, BOB, MN, [], [PC_CUSTODIAN_ORACLE_TYPE, FOO], {
      from: oracleManager
    });
    await this.oracles.addOracle(
      this.mX,
      charlie,
      CHARLIE,
      MN,
      [],
      [BAR, PC_CUSTODIAN_ORACLE_TYPE, PC_AUDITOR_ORACLE_TYPE],
      {
        from: oracleManager
      }
    );
    await this.oracles.addOracle(this.mX, dan, DAN, MN, [], [BUZZ, PE_AUDITOR_ORACLE_TYPE], {
      from: oracleManager
    });
    await this.oracles.addOracle(this.mX, eve, EVE, MN, [], [PC_AUDITOR_ORACLE_TYPE, PE_AUDITOR_ORACLE_TYPE], {
      from: oracleManager
    });

    this.oracleStakesAccountingXWeb3 = new web3.eth.Contract(
      this.oracleStakesAccountingX.abi,
      this.oracleStakesAccountingX.address
    );
  });

  describe('#stake()', () => {
    it('should allow any user stake for oracle', async function() {
      await this.galtToken.approve(this.oracleStakesAccountingX.address, ether(35), { from: alice });
      await this.oracleStakesAccountingX.stake(bob, PC_CUSTODIAN_ORACLE_TYPE, ether(35), { from: alice });

      let res = await this.oracleStakesAccountingXWeb3.methods.stakeOf(bob, NON_EXISTENT_ROLE).call();
      assert.equal(res, 0);
      res = await this.oracleStakesAccountingXWeb3.methods.stakeOf(bob, PC_CUSTODIAN_ORACLE_TYPE).call();
      assert.equal(res, ether(35));
    });

    it('should deny staking for non-existing role', async function() {
      await this.galtToken.approve(this.oracleStakesAccountingX.address, ether(35), { from: alice });
      await assertRevert(
        this.oracleStakesAccountingX.stake(bob, bytes32('non-exisitng-role'), ether(35), { from: alice })
      );

      const res = await this.oracleStakesAccountingXWeb3.methods.stakeOf(bob, NON_EXISTENT_ROLE).call();
      assert.equal(res, 0);
    });

    it('should deny staking for non-existing oracle', async function() {
      await this.galtToken.approve(this.oracleStakesAccountingX.address, ether(35), { from: alice });
      await assertRevert(this.oracleStakesAccountingX.stake(alice, NON_EXISTENT_ROLE, ether(35), { from: alice }));

      const res = await this.oracleStakesAccountingXWeb3.methods.stakeOf(alice, NON_EXISTENT_ROLE).call();
      assert.equal(res, 0);
    });
  });

  describe('#slash()', () => {
    beforeEach(async function() {
      await this.oracles.addOracle(this.mX, bob, BOB, MN, [], [PC_CUSTODIAN_ORACLE_TYPE, PC_AUDITOR_ORACLE_TYPE, FOO], {
        from: oracleManager
      });
      await this.galtToken.approve(this.oracleStakesAccountingX.address, ether(1000), { from: alice });
      await this.oracleStakesAccountingX.stake(bob, PC_CUSTODIAN_ORACLE_TYPE, ether(35), { from: alice });
      await this.oracleStakesAccountingX.stake(bob, PC_AUDITOR_ORACLE_TYPE, ether(55), { from: alice });
      await this.oracleStakesAccountingX.stake(bob, PC_CUSTODIAN_ORACLE_TYPE, ether(25), { from: alice });
    });

    it('should allow slash manager slashing oracle stake', async function() {
      await this.oracleStakesAccountingX.slash(bob, PC_AUDITOR_ORACLE_TYPE, ether(18), { from: slashManager });

      const res = await this.oracleStakesAccountingXWeb3.methods.stakeOf(bob, PC_AUDITOR_ORACLE_TYPE).call();
      assert.equal(res, ether(37));
    });

    it('should allow slash a stake to a negative value', async function() {
      await this.oracleStakesAccountingX.slash(bob, PC_AUDITOR_ORACLE_TYPE, ether(100), { from: slashManager });

      const res = await this.oracleStakesAccountingXWeb3.methods.stakeOf(bob, PC_AUDITOR_ORACLE_TYPE).call();
      assert.equal(res, ether(-45));
    });

    it('should deny non-slashing manager slashing stake', async function() {
      await assertRevert(this.oracleStakesAccountingX.slash(bob, PC_AUDITOR_ORACLE_TYPE, ether(100), { from: bob }));
    });

    it('should deny slashing non-existent role', async function() {
      await assertRevert(
        this.oracleStakesAccountingX.slash(bob, PE_AUDITOR_ORACLE_TYPE, ether(100), { from: slashManager })
      );
    });

    it('should allow slashing existent role with 0 balance', async function() {
      await this.oracleStakesAccountingX.slash(dan, PE_AUDITOR_ORACLE_TYPE, ether(100), { from: slashManager });

      const res = await this.oracleStakesAccountingXWeb3.methods.stakeOf(dan, PE_AUDITOR_ORACLE_TYPE).call();
      assert.equal(res, ether(-100));
    });
  });
});
