const GaltToken = artifacts.require('./GaltToken.sol');
const ACL = artifacts.require('./ACL.sol');
const SpaceToken = artifacts.require('./SpaceToken.sol');
const FeeRegistry = artifacts.require('./FeeRegistry.sol');
const MultiSigRegistry = artifacts.require('./MultiSigRegistry.sol');
const ClaimManager = artifacts.require('./ClaimManager.sol');
const MockSpaceRA = artifacts.require('./MockSpaceRA.sol');
const LockerRegistry = artifacts.require('./LockerRegistry.sol');
const GaltGlobalRegistry = artifacts.require('./GaltGlobalRegistry.sol');
const OracleStakesAccounting = artifacts.require('./OracleStakesAccounting.sol');
const StakeTracker = artifacts.require('./StakeTracker.sol');

const Web3 = require('web3');
const galt = require('@galtproject/utils');

const { assertRevert, ether, initHelperWeb3, numberToEvmWord, paymentMethods } = require('../../helpers');
const { deployMultiSigFactory, buildArbitration } = require('../../deploymentHelpers');

const { utf8ToHex, hexToUtf8 } = Web3.utils;
const bytes32 = utf8ToHex;
const web3 = new Web3(GaltToken.web3.currentProvider);

initHelperWeb3(web3);

// eslint-disable-next-line no-underscore-dangle
const _ES = bytes32('');
const MN = bytes32('MN');

const NICK = bytes32('Nick');
const MIKE = bytes32('Mike');
const OLIVER = bytes32('Oliver');

const PC_CUSTODIAN_ORACLE_TYPE = bytes32('PC_CUSTODIAN_ORACLE_TYPE');
const PC_AUDITOR_ORACLE_TYPE = bytes32('PC_AUDITOR_ORACLE_TYPE');

const PaymentMethods = {
  NONE: 0,
  ETH_ONLY: 1,
  GALT_ONLY: 2,
  ETH_AND_GALT: 3
};

const ClaimApplicationStatus = {
  NOT_EXISTS: 0,
  SUBMITTED: 1,
  APPROVED: 2,
  REJECTED: 3,
  REVERTED: 4
};

contract('ArbitratorSlashing', accounts => {
  const [
    coreTeam,
    spaceRA,
    oracleModifier,

    // initial arbitrators
    a1,
    a2,
    a3,

    // arbitrators
    alice,
    bob,
    charlie,
    dan,
    eve,

    // oracles
    mike,
    nick,
    oliver,

    // claimer
    zack,

    // unauthorized
    unauthorized
  ] = accounts;

  beforeEach(async function() {
    this.attachedDocuments = [
      'QmYNQJoKGNHTpPxCBPh9KkDpaExgd2duMa3aF6ytMpHdao',
      'QmeveuwF5wWBSgUXLG6p1oxF3GKkgjEnhA6AAwHUoVsx6E',
      'QmSrPmbaUKA3ZodhzPWZnpFgcPMFWF4QsxXbkWfEptTBJd'
    ];

    // Setup Galt token
    await (async () => {
      this.galtToken = await GaltToken.new({ from: coreTeam });

      await this.galtToken.mint(alice, ether(10000000), { from: coreTeam });
      await this.galtToken.mint(bob, ether(10000000), { from: coreTeam });
      await this.galtToken.mint(charlie, ether(10000000), { from: coreTeam });
      await this.galtToken.mint(dan, ether(10000000), { from: coreTeam });
      await this.galtToken.mint(eve, ether(10000000), { from: coreTeam });

      await this.galtToken.mint(mike, ether(10000000), { from: coreTeam });
      await this.galtToken.mint(nick, ether(10000000), { from: coreTeam });
      await this.galtToken.mint(oliver, ether(10000000), { from: coreTeam });

      await this.galtToken.mint(zack, ether(10000000), { from: coreTeam });
    })();

    // Create and initialize contracts
    await (async () => {
      this.spaceToken = await SpaceToken.new('Space Token', 'SPACE', { from: coreTeam });
      this.claimManager = await ClaimManager.new({ from: coreTeam });

      this.ggr = await GaltGlobalRegistry.new({ from: coreTeam });
      this.feeRegistry = await FeeRegistry.new({ from: coreTeam });
      this.multiSigRegistry = await MultiSigRegistry.new(this.ggr.address, { from: coreTeam });
      this.acl = await ACL.new({ from: coreTeam });
      this.spaceLockerRegistry = await LockerRegistry.new(this.ggr.address, bytes32('SPACE_LOCKER_REGISTRAR'), {
        from: coreTeam
      });
      this.myOracleStakesAccounting = await OracleStakesAccounting.new(alice, { from: coreTeam });
      this.stakeTracker = await StakeTracker.new(this.ggr.address, { from: coreTeam });

      await this.ggr.setContract(await this.ggr.ACL(), this.acl.address, { from: coreTeam });
      await this.ggr.setContract(await this.ggr.FEE_REGISTRY(), this.feeRegistry.address, { from: coreTeam });
      await this.ggr.setContract(await this.ggr.STAKE_TRACKER(), this.stakeTracker.address, { from: coreTeam });
      await this.ggr.setContract(await this.ggr.MULTI_SIG_REGISTRY(), this.multiSigRegistry.address, {
        from: coreTeam
      });
      await this.ggr.setContract(await this.ggr.GALT_TOKEN(), this.galtToken.address, { from: coreTeam });
      await this.ggr.setContract(await this.ggr.CLAIM_MANAGER(), this.claimManager.address, { from: coreTeam });
      await this.ggr.setContract(await this.ggr.SPACE_RA(), spaceRA, {
        from: coreTeam
      });
      this.sra = await MockSpaceRA.new(this.ggr.address, { from: coreTeam });
      this.multiSigFactory = await deployMultiSigFactory(this.ggr, coreTeam);

      await this.acl.setRole(bytes32('ARBITRATION_STAKE_SLASHER'), this.claimManager.address, true, { from: coreTeam });
      await this.acl.setRole(bytes32('ORACLE_STAKE_SLASHER'), this.claimManager.address, true, { from: coreTeam });
      await this.acl.setRole(bytes32('MULTI_SIG_REGISTRAR'), this.multiSigFactory.address, true, { from: coreTeam });
      await this.acl.setRole(bytes32('SPACE_REPUTATION_NOTIFIER'), this.sra.address, true, { from: coreTeam });
      await this.acl.setRole(bytes32('ORACLE_MODIFIER'), oracleModifier, true, { from: coreTeam });

      await this.feeRegistry.setProtocolEthShare(33, { from: coreTeam });
      await this.feeRegistry.setProtocolGaltShare(13, { from: coreTeam });

      await this.feeRegistry.setGaltFee(await this.multiSigFactory.FEE_KEY(), ether(10), { from: coreTeam });
      await this.feeRegistry.setEthFee(await this.multiSigFactory.FEE_KEY(), ether(5), { from: coreTeam });
      await this.feeRegistry.setPaymentMethod(await this.multiSigFactory.FEE_KEY(), paymentMethods.ETH_AND_GALT, {
        from: coreTeam
      });

      await this.claimManager.initialize(this.ggr.address, {
        from: coreTeam
      });
    })();

    // Setup multiSig
    await (async () => {
      const applicationConfig = {};
      applicationConfig[bytes32('CM_MINIMAL_FEE_ETH')] = numberToEvmWord(ether(6));
      applicationConfig[bytes32('CM_MINIMAL_FEE_GALT')] = numberToEvmWord(ether(45));
      applicationConfig[bytes32('CM_M')] = numberToEvmWord(2);
      applicationConfig[bytes32('CM_N')] = numberToEvmWord(3);
      applicationConfig[bytes32('CM_PAYMENT_METHOD')] = numberToEvmWord(PaymentMethods.ETH_AND_GALT);

      const pcCustodianKey = await this.myOracleStakesAccounting.oracleTypeMinimalStakeKey(PC_CUSTODIAN_ORACLE_TYPE);
      const pcAuditorKey = await this.myOracleStakesAccounting.oracleTypeMinimalStakeKey(PC_AUDITOR_ORACLE_TYPE);

      applicationConfig[pcCustodianKey] = numberToEvmWord(ether(200));
      applicationConfig[pcAuditorKey] = numberToEvmWord(ether(200));

      await this.galtToken.approve(this.multiSigFactory.address, ether(20), { from: alice });
      this.abX = await buildArbitration(
        this.multiSigFactory,
        [a1, a2, a3],
        2,
        7,
        10,
        60,
        ether(1000),
        [80, 80, 70, 90, 90, 30, 30, 30],
        applicationConfig,
        alice
      );
      this.abMultiSigX = this.abX.multiSig;
      this.oracleStakesAccountingX = this.abX.oracleStakeAccounting;
      this.candidateTopX = this.abX.candidateTop;
      this.arbitratorStakeAccountingX = this.abX.arbitratorStakeAccounting;
      this.delegateSpaceVotingX = this.abX.delegateSpaceVoting;
      this.oraclesX = this.abX.oracles;

      this.mX = this.abMultiSigX.address;
    })();

    // Mint and distribute SRA reputation using mock
    await (async () => {
      await this.sra.mintAll([alice, bob, charlie, dan, eve], ['10', '11', '12', '13', '14'], 500);
      assert.equal(await this.sra.balanceOf(alice), 500);
      await this.sra.lockReputation(this.mX, 500, { from: alice });
      await this.sra.lockReputation(this.mX, 500, { from: bob });
      await this.sra.delegate(charlie, dan, 500, { from: dan });
      await this.sra.lockReputation(this.mX, 1000, { from: charlie });
      await this.sra.lockReputation(this.mX, 500, { from: eve });
    })();

    // Vote for arbitrators
    await (async () => {
      await this.delegateSpaceVotingX.grantReputation(alice, 500, { from: bob });
      await this.delegateSpaceVotingX.grantReputation(charlie, 500, { from: alice });
      await this.delegateSpaceVotingX.grantReputation(alice, 500, { from: charlie });
      await this.delegateSpaceVotingX.grantReputation(bob, 500, { from: charlie });
      await this.delegateSpaceVotingX.grantReputation(eve, 500, { from: eve });

      assert.equal(await this.delegateSpaceVotingX.balanceOf(alice), 1000);

      await this.candidateTopX.recalculate(alice, { from: unauthorized });
      await this.candidateTopX.recalculate(bob, { from: unauthorized });
      await this.candidateTopX.recalculate(charlie, { from: unauthorized });
      await this.candidateTopX.recalculate(dan, { from: unauthorized });
      await this.candidateTopX.recalculate(eve, { from: unauthorized });

      assert.equal(await this.candidateTopX.getCandidateWeight(alice), 160000);

      let res = await this.candidateTopX.getSize();
      assert.equal(res, 4);

      res = await this.candidateTopX.getCandidates();
      assert.sameMembers(res, [alice, bob, charlie, eve]);
      res = await this.candidateTopX.getCandidatesWithStakes();
      assert.sameMembers(res, []);
    })();

    // Push arbitrators
    await assertRevert(this.candidateTopX.pushArbitrators());

    // > 4 arbitrators make their stake...
    await (async () => {
      await this.galtToken.approve(this.arbitratorStakeAccountingX.address, ether(2000), { from: alice });
      await this.galtToken.approve(this.arbitratorStakeAccountingX.address, ether(2000), { from: bob });
      await this.galtToken.approve(this.arbitratorStakeAccountingX.address, ether(2000), { from: charlie });
      await this.galtToken.approve(this.arbitratorStakeAccountingX.address, ether(2000), { from: dan });
      await this.galtToken.approve(this.arbitratorStakeAccountingX.address, ether(2000), { from: eve });

      await this.arbitratorStakeAccountingX.stake(alice, ether(2000), { from: alice });
      await this.arbitratorStakeAccountingX.stake(bob, ether(2000), { from: bob });
      await this.arbitratorStakeAccountingX.stake(charlie, ether(2000), { from: charlie });
      await this.arbitratorStakeAccountingX.stake(dan, ether(2000), { from: dan });
      await this.arbitratorStakeAccountingX.stake(eve, ether(2000), { from: eve });

      let res = await this.arbitratorStakeAccountingX.balanceOf(alice);
      assert.equal(res, ether(2000));

      res = await this.candidateTopX.getCandidates();
      assert.sameMembers(res, [alice, bob, charlie, eve]);
      res = await this.candidateTopX.getCandidatesWithStakes();
      assert.sameMembers(res, [alice, bob, charlie, eve]);

      await this.candidateTopX.pushArbitrators();

      res = await this.abMultiSigX.getOwners();
      assert.sameMembers(res, [alice, bob, charlie, eve]);
    })();
  });

  describe('#slashing ()', () => {
    it('should slash', async function() {
      // > 3 oracles are added by oracleModifier

      await this.oraclesX.addOracle(mike, MIKE, MN, [_ES], [PC_CUSTODIAN_ORACLE_TYPE, PC_AUDITOR_ORACLE_TYPE], {
        from: oracleModifier
      });
      await this.oraclesX.addOracle(nick, NICK, MN, [_ES], [PC_CUSTODIAN_ORACLE_TYPE, PC_AUDITOR_ORACLE_TYPE], {
        from: oracleModifier
      });
      await this.oraclesX.addOracle(oliver, OLIVER, MN, [_ES], [PC_CUSTODIAN_ORACLE_TYPE, PC_AUDITOR_ORACLE_TYPE], {
        from: oracleModifier
      });

      await this.galtToken.approve(this.oracleStakesAccountingX.address, ether(3000), { from: alice });
      await this.oracleStakesAccountingX.stake(mike, PC_AUDITOR_ORACLE_TYPE, ether(350), { from: alice });
      await this.oracleStakesAccountingX.stake(nick, PC_AUDITOR_ORACLE_TYPE, ether(350), { from: alice });
      await this.oracleStakesAccountingX.stake(oliver, PC_AUDITOR_ORACLE_TYPE, ether(350), { from: alice });
      await this.oracleStakesAccountingX.stake(mike, PC_CUSTODIAN_ORACLE_TYPE, ether(350), { from: alice });
      await this.oracleStakesAccountingX.stake(nick, PC_CUSTODIAN_ORACLE_TYPE, ether(350), { from: alice });
      await this.oracleStakesAccountingX.stake(oliver, PC_CUSTODIAN_ORACLE_TYPE, ether(350), { from: alice });

      // > Asserting that oracles have all their roles active
      let res = await this.oraclesX.getOracle(mike);
      assert.sameMembers(
        res.assignedOracleTypes.map(hexToUtf8),
        [PC_CUSTODIAN_ORACLE_TYPE, PC_AUDITOR_ORACLE_TYPE].map(hexToUtf8)
      );
      assert.equal(await this.oracleStakesAccountingX.isOracleStakeActive(mike, PC_CUSTODIAN_ORACLE_TYPE), true);
      assert.equal(await this.oracleStakesAccountingX.isOracleStakeActive(mike, PC_AUDITOR_ORACLE_TYPE), true);

      res = await this.oraclesX.getOracle(nick);
      assert.sameMembers(
        res.assignedOracleTypes.map(hexToUtf8),
        [PC_CUSTODIAN_ORACLE_TYPE, PC_AUDITOR_ORACLE_TYPE].map(hexToUtf8)
      );
      assert.equal(await this.oracleStakesAccountingX.isOracleStakeActive(nick, PC_CUSTODIAN_ORACLE_TYPE), true);
      assert.equal(await this.oracleStakesAccountingX.isOracleStakeActive(nick, PC_AUDITOR_ORACLE_TYPE), true);

      // > Unknown user makes a new claim using Claim Manager
      res = await this.claimManager.submit(
        this.mX,
        alice,
        ether(35),
        this.attachedDocuments.map(galt.ipfsHashToBytes32),
        0,
        { from: alice, value: ether(7) }
      );

      this.cId = res.logs[0].args.id;

      await this.claimManager.lock(this.cId, { from: alice });
      await this.claimManager.lock(this.cId, { from: bob });
      await this.claimManager.lock(this.cId, { from: charlie });

      // > Arbitrator 1 makes his proposal to fine [Oracle 1, 2] and Arbitrator [2, 3]
      res = await this.claimManager.proposeApproval(
        this.cId,
        'looks good',
        ether(30),
        [mike, nick],
        [PC_CUSTODIAN_ORACLE_TYPE, PC_AUDITOR_ORACLE_TYPE],
        [ether(200), ether(50)],
        [alice, bob],
        [ether(200), ether(1500)],
        { from: charlie }
      );
      this.pId2 = res.logs[0].args.proposalId;

      // > make proposal accepted
      await this.claimManager.vote(this.cId, this.pId2, { from: bob });

      res = await this.claimManager.claim(this.cId);
      assert.equal(res.status, ClaimApplicationStatus.APPROVED);

      // > Check that oracles were punished
      res = await this.oracleStakesAccountingX.stakeOf(mike, PC_AUDITOR_ORACLE_TYPE);
      assert.equal(res, ether(350));
      res = await this.oracleStakesAccountingX.stakeOf(mike, PC_CUSTODIAN_ORACLE_TYPE);
      assert.equal(res, ether(150));

      res = await this.oraclesX.getOracle(mike);

      assert.sameMembers(
        res.assignedOracleTypes.map(hexToUtf8),
        [PC_CUSTODIAN_ORACLE_TYPE, PC_AUDITOR_ORACLE_TYPE].map(hexToUtf8)
      );
      // assert.sameMembers(res.activeOracleTypes.map(hexToUtf8), [PC_AUDITOR_ORACLE_TYPE].map(hexToUtf8));
      assert.equal(await this.oracleStakesAccountingX.isOracleStakeActive(mike, PC_CUSTODIAN_ORACLE_TYPE), false);
      assert.equal(await this.oracleStakesAccountingX.isOracleStakeActive(mike, PC_AUDITOR_ORACLE_TYPE), true);

      res = await this.oraclesX.getOracle(nick);
      assert.sameMembers(
        res.assignedOracleTypes.map(hexToUtf8),
        [PC_CUSTODIAN_ORACLE_TYPE, PC_AUDITOR_ORACLE_TYPE].map(hexToUtf8)
      );
      assert.equal(await this.oracleStakesAccountingX.isOracleStakeActive(nick, PC_CUSTODIAN_ORACLE_TYPE), true);
      assert.equal(await this.oracleStakesAccountingX.isOracleStakeActive(nick, PC_AUDITOR_ORACLE_TYPE), true);

      // > Check that arbitrators were punished
      res = await this.arbitratorStakeAccountingX.balanceOf(alice);
      assert.equal(res, ether(1800));
      res = await this.arbitratorStakeAccountingX.balanceOf(bob);
      assert.equal(res, ether(500));

      // > Re-push the arbitrators list
      // one of the punished arbitrators is kicked of the arbitrators list
      res = await this.candidateTopX.getCandidates();
      assert.sameMembers(res, [alice, bob, charlie, eve]);
      res = await this.candidateTopX.getCandidatesWithStakes();
      assert.sameMembers(res, [alice, charlie, eve]);

      await this.candidateTopX.pushArbitrators();

      res = await this.abMultiSigX.getOwners();
      assert.sameMembers(res, [alice, charlie, eve]);
    });
  });

  describe('ignoredCandidates', () => {
    it('should recalculate balance of ignored candidate to 0', async function() {
      await this.candidateTopX.ignoreMe(true, { from: alice });

      assert.equal(await this.candidateTopX.isIgnored(alice), true);
      assert.equal(await this.candidateTopX.getCandidateWeight(alice), 160000);
      assert.equal(await this.candidateTopX.getTopCandidateWeight(alice), 160000);

      await this.candidateTopX.recalculate(alice);

      assert.equal(await this.candidateTopX.getCandidateWeight(alice), 160000);
      assert.equal(await this.candidateTopX.getTopCandidateWeight(alice), 0);

      let res = await this.candidateTopX.getCandidates();
      assert.sameMembers(res, [bob, charlie, eve]);
      res = await this.candidateTopX.getCandidatesWithStakes();
      assert.sameMembers(res, [bob, charlie, eve]);

      await this.candidateTopX.pushArbitrators();

      res = await this.abMultiSigX.getOwners();
      assert.sameMembers(res, [bob, charlie, eve]);

      // and turn in on again
      await this.candidateTopX.ignoreMe(false, { from: alice });

      assert.equal(await this.candidateTopX.isIgnored(alice), false);
      assert.equal(await this.candidateTopX.getCandidateWeight(alice), 160000);
      assert.equal(await this.candidateTopX.getTopCandidateWeight(alice), 0);

      await this.candidateTopX.recalculate(alice);

      assert.equal(await this.candidateTopX.getCandidateWeight(alice), 160000);
      assert.equal(await this.candidateTopX.getTopCandidateWeight(alice), 160000);

      res = await this.candidateTopX.getCandidates();
      assert.sameMembers(res, [alice, bob, charlie, eve]);
      res = await this.candidateTopX.getCandidatesWithStakes();
      assert.sameMembers(res, [alice, bob, charlie, eve]);

      await this.candidateTopX.pushArbitrators();

      res = await this.abMultiSigX.getOwners();
      assert.sameMembers(res, [alice, bob, charlie, eve]);
    });
  });
});
