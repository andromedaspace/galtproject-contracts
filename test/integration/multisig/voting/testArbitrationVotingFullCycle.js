/* eslint-disable prefer-arrow-callback */
const SpaceToken = artifacts.require('./SpaceToken.sol');
const Oracles = artifacts.require('./Oracles.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const SpaceRA = artifacts.require('./SpaceRA.sol');
const GaltRA = artifacts.require('./GaltRA.sol');
const MultiSigRegistry = artifacts.require('./MultiSigRegistry.sol');
const LockerRegistry = artifacts.require('./LockerRegistry.sol');
const SpaceLockerFactory = artifacts.require('./SpaceLockerFactory.sol');
const GaltLockerFactory = artifacts.require('./GaltLockerFactory.sol');
const SpaceLocker = artifacts.require('./SpaceLocker.sol');
const GaltLocker = artifacts.require('./GaltLocker.sol');
const GaltGlobalRegistry = artifacts.require('./GaltGlobalRegistry.sol');

const Web3 = require('web3');
const { ether, initHelperWeb3, initHelperArtifacts, deploySplitMergeMock } = require('../../../helpers');

const web3 = new Web3(SpaceToken.web3.currentProvider);
const { utf8ToHex } = Web3.utils;
const bytes32 = utf8ToHex;
const { deployMultiSigFactory, buildArbitration } = require('../../../deploymentHelpers');

initHelperWeb3(web3);
initHelperArtifacts(artifacts);

const MY_APPLICATION = '0x6f7c49efa4ebd19424a5018830e177875fd96b20c1ae22bc5eb7be4ac691e7b7';

const TYPE_A = bytes32('TYPE_A');
const TYPE_B = bytes32('TYPE_B');
const TYPE_C = bytes32('TYPE_C');
// eslint-disable-next-line no-underscore-dangle
const _ES = bytes32('');
const MN = bytes32('MN');
const DAN = bytes32('Dan');
const GEORGE = bytes32('George');
const FRANK = bytes32('Frank');

// NOTICE: we don't wrap MockToken with a proxy on production
contract('Arbitration Voting From (Space/Galt/Stake) Inputs To Assigned MultiSig Owners', accounts => {
  const [
    coreTeam,
    oracleManager,
    claimManager,
    geoDateManagement,
    zeroOwner,
    alice,
    bob,
    charlie,
    dan,
    eve,
    george,
    frank,
    minter
  ] = accounts;

  before(async function() {
    this.ggr = await GaltGlobalRegistry.new({ from: coreTeam });
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.oracles = await Oracles.new({ from: coreTeam });
    this.spaceToken = await SpaceToken.new('Space Token', 'SPACE', { from: coreTeam });
    const deployment = await deploySplitMergeMock(this.ggr);
    this.splitMerge = deployment.splitMerge;

    this.spaceLockerRegistry = await LockerRegistry.new({ from: coreTeam });
    this.galtLockerRegistry = await LockerRegistry.new({ from: coreTeam });
    this.spaceLockerFactory = await SpaceLockerFactory.new(this.ggr.address, { from: coreTeam });
    this.galtLockerFactory = await GaltLockerFactory.new(this.ggr.address, { from: coreTeam });

    this.multiSigRegistry = await MultiSigRegistry.new({ from: coreTeam });

    await this.oracles.addRoleTo(oracleManager, await this.oracles.ROLE_APPLICATION_TYPE_MANAGER(), {
      from: coreTeam
    });
    await this.oracles.addRoleTo(oracleManager, await this.oracles.ROLE_ORACLE_MANAGER(), {
      from: coreTeam
    });
    await this.spaceToken.addRoleTo(minter, 'minter', {
      from: coreTeam
    });
    await this.splitMerge.addRoleTo(geoDateManagement, 'geo_data_manager', {
      from: coreTeam
    });
    await this.spaceLockerRegistry.addRoleTo(
      this.spaceLockerFactory.address,
      await this.spaceLockerRegistry.ROLE_FACTORY(),
      {
        from: coreTeam
      }
    );
    await this.galtLockerRegistry.addRoleTo(
      this.galtLockerFactory.address,
      await this.galtLockerRegistry.ROLE_FACTORY(),
      {
        from: coreTeam
      }
    );
    this.spaceRA = await SpaceRA.new(this.ggr.address, { from: coreTeam });
    this.galtRA = await GaltRA.new(this.ggr.address, { from: coreTeam });

    await this.ggr.setContract(await this.ggr.MULTI_SIG_REGISTRY(), this.multiSigRegistry.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.GALT_TOKEN(), this.galtToken.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.SPACE_TOKEN(), this.spaceToken.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.ORACLES(), this.oracles.address, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.CLAIM_MANAGER(), claimManager, { from: coreTeam });
    await this.ggr.setContract(await this.ggr.SPACE_LOCKER_REGISTRY(), this.spaceLockerRegistry.address, {
      from: coreTeam
    });
    await this.ggr.setContract(await this.ggr.GALT_LOCKER_REGISTRY(), this.galtLockerRegistry.address, {
      from: coreTeam
    });
    await this.ggr.setContract(await this.ggr.SPACE_RA(), this.spaceRA.address, {
      from: coreTeam
    });

    await this.galtToken.mint(alice, ether(1000000000), { from: coreTeam });
    await this.galtToken.mint(bob, ether(1000000000), { from: coreTeam });
    await this.galtToken.mint(charlie, ether(1000000000), { from: coreTeam });
    await this.galtToken.mint(dan, ether(1000000000), { from: coreTeam });

    await this.oracles.setApplicationTypeOracleTypes(
      MY_APPLICATION,
      [TYPE_A, TYPE_B, TYPE_C],
      [50, 25, 25],
      [_ES, _ES, _ES],
      { from: oracleManager }
    );
  });

  beforeEach(async function() {
    this.spaceRA = await SpaceRA.new(this.ggr.address, { from: coreTeam });

    await this.ggr.setContract(await this.ggr.SPACE_RA(), this.spaceRA.address, {
      from: coreTeam
    });

    this.multiSigFactory = await deployMultiSigFactory(this.ggr, coreTeam);

    await this.galtToken.approve(this.multiSigFactory.address, ether(10), { from: alice });

    const applicationConfigX = {};
    // MultiSigX
    this.abX = await buildArbitration(
      this.multiSigFactory,
      [bob, charlie, dan, eve],
      2,
      3,
      4,
      60,
      ether(1000),
      [30, 30, 30, 30, 30, 30],
      applicationConfigX,
      alice
    );
    this.abMultiSigX = this.abX.multiSig;
    this.oracleStakesAccountingX = this.abX.oracleStakeAccounting;
    this.arbitratorStakeAccountingX = this.abX.arbitratorStakeAccounting;
    this.candidateTopX = this.abX.candidateTop;
    this.delegateSpaceVotingX = this.abX.delegateSpaceVoting;
    this.delegateGaltVotingX = this.abX.delegateGaltVoting;
    this.oracleStakeVotingX = this.abX.oracleStakeVoting;

    // CONFIGURING
    this.X = this.abMultiSigX.address;
  });

  it('Mixed Scenario. 3 space owners / 3 galt owners / 3 oracles', async function() {
    // space owners - alice/bob/charlie
    // galt owners - bob/charlie/dan
    // oracles - dan/george/frank

    // *****************************
    // Step #1-1 >>> LOCK SPACE TOKENS
    // *****************************
    await this.spaceToken.mint(zeroOwner, { from: minter });
    let res = await this.spaceToken.mint(alice, { from: minter });
    const x1 = res.logs[0].args.tokenId;
    res = await this.spaceToken.mint(bob, { from: minter });
    const x2 = res.logs[0].args.tokenId;
    res = await this.spaceToken.mint(charlie, { from: minter });
    const x3 = res.logs[0].args.tokenId;

    // SET AREAS
    let p = [
      this.splitMerge.setTokenArea(x1, '300', '0', { from: geoDateManagement }),
      this.splitMerge.setTokenArea(x2, '500', '0', { from: geoDateManagement }),
      this.splitMerge.setTokenArea(x3, '400', '0', { from: geoDateManagement })
    ];

    await Promise.all(p);

    await this.galtToken.approve(this.spaceLockerFactory.address, ether(10), { from: alice });
    await this.galtToken.approve(this.spaceLockerFactory.address, ether(10), { from: bob });
    await this.galtToken.approve(this.spaceLockerFactory.address, ether(10), { from: charlie });

    // BUILD LOCKER CONTRACTS
    res = await this.spaceLockerFactory.build({ from: alice });
    const lockerAddress1 = res.logs[0].args.locker;
    res = await this.spaceLockerFactory.build({ from: bob });
    const lockerAddress2 = res.logs[0].args.locker;
    res = await this.spaceLockerFactory.build({ from: charlie });
    const lockerAddress3 = res.logs[0].args.locker;

    const spaceLocker1 = await SpaceLocker.at(lockerAddress1);
    const spaceLocker2 = await SpaceLocker.at(lockerAddress2);
    const spaceLocker3 = await SpaceLocker.at(lockerAddress3);

    // APPROVE SPACE TOKENS
    await this.spaceToken.approve(lockerAddress1, x1, { from: alice });
    await this.spaceToken.approve(lockerAddress2, x2, { from: bob });
    await this.spaceToken.approve(lockerAddress3, x3, { from: charlie });

    // DEPOSIT SPACE TOKENS
    await spaceLocker1.deposit(x1, { from: alice });
    await spaceLocker2.deposit(x2, { from: bob });
    await spaceLocker3.deposit(x3, { from: charlie });

    // APPROVE REPUTATION MINT AT ASRA
    p = [
      spaceLocker1.approveMint(this.spaceRA.address, { from: alice }),
      spaceLocker2.approveMint(this.spaceRA.address, { from: bob }),
      spaceLocker3.approveMint(this.spaceRA.address, { from: charlie })
    ];

    await Promise.all(p);

    // MINT REPUTATION TOKENS AT ASRA
    p = [
      this.spaceRA.mint(lockerAddress1, { from: alice }),
      this.spaceRA.mint(lockerAddress2, { from: bob }),
      this.spaceRA.mint(lockerAddress3, { from: charlie })
    ];

    await Promise.all(p);

    res = await this.spaceRA.balanceOf(alice);
    assert.equal(res, 300);

    res = await this.spaceRA.balanceOf(bob);
    assert.equal(res, 500);

    res = await this.spaceRA.balanceOf(charlie);
    assert.equal(res, 400);

    p = [
      this.spaceRA.lockReputation(this.X, '300', { from: alice }),
      this.spaceRA.lockReputation(this.X, '500', { from: bob }),
      this.spaceRA.lockReputation(this.X, '400', { from: charlie })
    ];

    await Promise.all(p);

    // ****************************
    // Step #1-2 >>> LOCK GALT TOKENS
    // ****************************
    await this.galtToken.approve(this.galtLockerFactory.address, ether(10), { from: bob });
    await this.galtToken.approve(this.galtLockerFactory.address, ether(10), { from: charlie });
    await this.galtToken.approve(this.galtLockerFactory.address, ether(10), { from: dan });

    // BUILD LOCKER CONTRACTS
    res = await this.galtLockerFactory.build({ from: bob });
    const galtLockerAddress1 = res.logs[0].args.locker;
    res = await this.galtLockerFactory.build({ from: charlie });
    const galtLockerAddress2 = res.logs[0].args.locker;
    res = await this.galtLockerFactory.build({ from: dan });
    const galtLockerAddress3 = res.logs[0].args.locker;

    const galtLocker1 = await GaltLocker.at(galtLockerAddress1);
    const galtLocker2 = await GaltLocker.at(galtLockerAddress2);
    const galtLocker3 = await GaltLocker.at(galtLockerAddress3);

    // APPROVE SPACE TOKENS
    await this.galtToken.approve(galtLockerAddress1, ether(8000), { from: bob });
    await this.galtToken.approve(galtLockerAddress2, ether(4000), { from: charlie });
    await this.galtToken.approve(galtLockerAddress3, ether(12000), { from: dan });

    // DEPOSIT SPACE TOKENS
    await galtLocker1.deposit(ether(8000), { from: bob });
    await galtLocker2.deposit(ether(4000), { from: charlie });
    await galtLocker3.deposit(ether(12000), { from: dan });

    // APPROVE REPUTATION MINT AT ASRA
    p = [
      galtLocker1.approveMint(this.galtRA.address, { from: bob }),
      galtLocker2.approveMint(this.galtRA.address, { from: charlie }),
      galtLocker3.approveMint(this.galtRA.address, { from: dan })
    ];

    await Promise.all(p);

    // MINT REPUTATION TOKENS AT ASRA
    p = [
      this.galtRA.mint(galtLockerAddress1, { from: bob }),
      this.galtRA.mint(galtLockerAddress2, { from: charlie }),
      this.galtRA.mint(galtLockerAddress3, { from: dan })
    ];

    await Promise.all(p);

    res = await this.galtRA.balanceOf(bob);
    assert.equal(res, ether(8000));

    res = await this.galtRA.balanceOf(charlie);
    assert.equal(res, ether(4000));

    res = await this.galtRA.balanceOf(dan);
    assert.equal(res, ether(12000));

    p = [
      // NOTICE: not all bobs reputation locked
      this.galtRA.lockReputation(this.X, ether(4000), { from: bob }),
      this.galtRA.lockReputation(this.X, ether(4000), { from: charlie }),
      this.galtRA.lockReputation(this.X, ether(12000), { from: dan })
    ];

    await Promise.all(p);

    // *********************************
    // Step #1-3 >>> STAKE ORACLE DEPOSITS
    // *********************************
    await this.oracles.setOracleTypeMinimalDeposit(TYPE_A, ether(1000), { from: oracleManager });
    await this.oracles.setOracleTypeMinimalDeposit(TYPE_B, ether(1000), { from: oracleManager });
    await this.oracles.setOracleTypeMinimalDeposit(TYPE_C, ether(2000), { from: oracleManager });

    await this.oracles.addOracle(this.abMultiSigX.address, dan, DAN, MN, '', [], [TYPE_A], {
      from: oracleManager
    });
    await this.oracles.addOracle(this.abMultiSigX.address, george, GEORGE, MN, '', [], [TYPE_B, TYPE_C], {
      from: oracleManager
    });
    await this.oracles.addOracle(this.abMultiSigX.address, frank, FRANK, MN, '', [], [TYPE_A, TYPE_B, TYPE_C], {
      from: oracleManager
    });

    await this.galtToken.approve(this.oracleStakesAccountingX.address, ether(30000), { from: alice });
    await this.oracleStakesAccountingX.stake(dan, TYPE_A, ether(2000), { from: alice });
    await this.oracleStakesAccountingX.stake(george, TYPE_B, ether(2000), { from: alice });
    await this.oracleStakesAccountingX.stake(george, TYPE_C, ether(3000), { from: alice });
    await this.oracleStakesAccountingX.stake(frank, TYPE_A, ether(1000), { from: alice });
    await this.oracleStakesAccountingX.stake(frank, TYPE_B, ether(1000), { from: alice });
    await this.oracleStakesAccountingX.stake(frank, TYPE_C, ether(2000), { from: alice });

    // ***********************************
    // Step #2-1 >>> DELEGATE SPACE VOTING
    // ***********************************
    await this.delegateSpaceVotingX.grantReputation(dan, 300, { from: alice });
    await this.delegateSpaceVotingX.grantReputation(dan, 100, { from: bob });
    await this.delegateSpaceVotingX.grantReputation(bob, 400, { from: bob });
    await this.delegateSpaceVotingX.grantReputation(bob, 300, { from: charlie });
    await this.delegateSpaceVotingX.grantReputation(alice, 100, { from: charlie });

    res = await this.delegateSpaceVotingX.balanceOf(alice);
    assert.equal(res, 100);
    res = await this.delegateSpaceVotingX.balanceOf(bob);
    assert.equal(res, 700);
    res = await this.delegateSpaceVotingX.balanceOf(dan);
    assert.equal(res, 400);
    res = await this.delegateSpaceVotingX.totalSupply();
    assert.equal(res, 1200);

    res = await this.candidateTopX.getCandidateWeight(alice);
    assert.equal(res, 33333);
    res = await this.candidateTopX.getCandidateWeight(bob);
    assert.equal(res, 293333);
    res = await this.candidateTopX.getCandidateWeight(dan);
    assert.equal(res, 313333);

    // ***********************************
    // Step #2-2 >>> DELEGATE GALT VOTING
    // ***********************************

    await this.delegateGaltVotingX.grantReputation(alice, ether(3000), { from: bob });
    await this.delegateGaltVotingX.grantReputation(alice, ether(1000), { from: bob });
    await this.delegateGaltVotingX.grantReputation(bob, ether(4000), { from: charlie });
    await this.delegateGaltVotingX.grantReputation(bob, ether(12000), { from: dan });

    res = await this.delegateGaltVotingX.balanceOf(alice);
    assert.equal(res, ether(4000));
    res = await this.delegateGaltVotingX.balanceOf(bob);
    assert.equal(res, ether(16000));
    res = await this.delegateGaltVotingX.balanceOf(dan);
    assert.equal(res, 0);
    res = await this.delegateGaltVotingX.totalSupply();
    assert.equal(res, ether(20000));

    res = await this.candidateTopX.getCandidateWeight(alice);
    assert.equal(res, 93333);
    res = await this.candidateTopX.getCandidateWeight(bob);
    assert.equal(res, 473333);
    res = await this.candidateTopX.getCandidateWeight(dan);
    assert.equal(res, 133333);

    // ***********************************
    // Step #2-3 >>> ORACLE STAKE VOTING
    // ***********************************

    await this.oracleStakeVotingX.vote(bob, { from: dan });
    await this.oracleStakeVotingX.vote(bob, { from: george });
    await this.oracleStakeVotingX.vote(alice, { from: frank });

    res = await this.oracleStakeVotingX.balanceOf(alice);
    assert.equal(res, ether(4000));
    res = await this.oracleStakeVotingX.balanceOf(bob);
    assert.equal(res, ether(7000));
    res = await this.oracleStakeVotingX.balanceOf(dan);
    assert.equal(res, 0);
    res = await this.oracleStakeVotingX.totalSupply();
    assert.equal(res, ether(11000));

    res = await this.candidateTopX.getCandidateWeight(alice);
    assert.equal(res, 202423);
    res = await this.candidateTopX.getCandidateWeight(bob);
    assert.equal(res, 664241);
    res = await this.candidateTopX.getCandidateWeight(dan);
    assert.equal(res, 133333);

    // ***********************************
    // Step #3 >>> TOP GENERATION
    // ***********************************
    // Expected candidates:
    // 1 - bob
    // 2 - alice
    // 3 - dan
    await this.candidateTopX.recalculate(alice);
    await this.candidateTopX.recalculate(bob);
    await this.candidateTopX.recalculate(charlie);
    await this.candidateTopX.recalculate(dan);
    await this.candidateTopX.recalculate(eve);
    await this.candidateTopX.recalculate(george);
    await this.candidateTopX.recalculate(frank);

    res = await this.candidateTopX.getCandidates();
    assert.equal(res.length, 3);
    assert.equal(res[0], bob);
    assert.equal(res[1], alice);
    assert.equal(res[2], dan);

    // ***********************************
    // Step #4 >>> CANDIDATES PUSH
    // ***********************************
    await this.galtToken.approve(this.arbitratorStakeAccountingX.address, ether(3000), { from: bob });

    await this.arbitratorStakeAccountingX.stake(bob, ether(1000), { from: bob });
    await this.arbitratorStakeAccountingX.stake(alice, ether(1000), { from: bob });
    await this.arbitratorStakeAccountingX.stake(dan, ether(1000), { from: bob });

    res = await this.abMultiSigX.getOwners();
    assert.sameMembers(res, [bob, charlie, dan, eve]);

    await this.candidateTopX.pushArbitrators();

    res = await this.abMultiSigX.getOwners();
    assert.sameMembers(res, [bob, alice, dan]);
  });
});
