const GaltToken = artifacts.require('./GaltToken.sol');
const GaltDex = artifacts.require('./GaltDex.sol');
const SpaceToken = artifacts.require('./SpaceToken.sol');
const PlotValuation = artifacts.require('./PlotValuation.sol');
const PlotCustodian = artifacts.require('./PlotCustodianManager.sol');
const Oracles = artifacts.require('./Oracles.sol');
const Web3 = require('web3');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const chaiBigNumber = require('chai-bignumber')(Web3.utils.BN);
const {
  zeroAddress,
  initHelperWeb3,
  initHelperArtifacts,
  ether,
  szabo,
  deploySplitMerge,
  clearLibCache
} = require('../helpers');

const web3 = new Web3(GaltToken.web3.currentProvider);
initHelperWeb3(web3);
initHelperArtifacts(artifacts);
const { BN } = Web3.utils;

// TODO: move to helpers
Web3.utils.BN.prototype.equal = Web3.utils.BN.prototype.eq;
Web3.utils.BN.prototype.equals = Web3.utils.BN.prototype.eq;

chai.use(chaiAsPromised);
chai.use(chaiBigNumber);
chai.should();

contract('GaltDex', ([coreTeam, multiSigX, stakeManager, stakeNotifier, alice, bob, dan, eve]) => {
  before(clearLibCache);
  const fee = 15;
  const baseExchangeRate = 1;

  beforeEach(async function() {
    this.spaceToken = await SpaceToken.new('Space Token', 'SPACE', { from: coreTeam });

    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.galtDex = await GaltDex.new({ from: coreTeam });
    this.oracles = await Oracles.new({ from: coreTeam });
    this.splitMerge = await deploySplitMerge();
    this.plotValuation = await PlotValuation.new({ from: coreTeam });
    this.plotCustodian = await PlotCustodian.new({ from: coreTeam });

    this.galtDex.initialize(szabo(baseExchangeRate), szabo(fee), szabo(fee), this.galtToken.address, zeroAddress, {
      from: coreTeam
    });

    await this.spaceToken.addRoleTo(coreTeam, 'minter');

    await this.galtDex.addRoleTo(coreTeam, 'fee_manager');

    await this.galtToken.mint(this.galtDex.address, ether(100));

    await this.plotValuation.initialize(
      this.spaceToken.address,
      this.splitMerge.address,
      this.oracles.address,
      this.galtToken.address,
      coreTeam,
      {
        from: coreTeam
      }
    );

    await this.plotCustodian.initialize(
      this.spaceToken.address,
      this.splitMerge.address,
      this.oracles.address,
      this.galtToken.address,
      zeroAddress,
      coreTeam,
      {
        from: coreTeam
      }
    );

    await this.oracles.addRoleTo(coreTeam, await this.oracles.ROLE_APPLICATION_TYPE_MANAGER(), {
      from: coreTeam
    });
    await this.oracles.addRoleTo(coreTeam, await this.oracles.ROLE_ORACLE_TYPE_MANAGER(), {
      from: coreTeam
    });
    await this.oracles.addRoleTo(coreTeam, await this.oracles.ROLE_ORACLE_MANAGER(), {
      from: coreTeam
    });
    await this.oracles.addRoleTo(stakeManager, await this.oracles.ROLE_ORACLE_STAKES_MANAGER(), {
      from: coreTeam
    });
    await this.oracles.addRoleTo(stakeNotifier, await this.oracles.ROLE_ORACLE_STAKES_NOTIFIER(), {
      from: coreTeam
    });
    const PV_APPRAISER_ORACLE_TYPE = await this.plotValuation.PV_APPRAISER_ORACLE_TYPE.call();
    const PV_APPRAISER2_ORACLE_TYPE = await this.plotValuation.PV_APPRAISER2_ORACLE_TYPE.call();
    const PV_AUDITOR_ORACLE_TYPE = await this.plotValuation.PV_AUDITOR_ORACLE_TYPE.call();

    await this.oracles.setApplicationTypeOracleTypes(
      await this.plotValuation.APPLICATION_TYPE(),
      [PV_APPRAISER_ORACLE_TYPE, PV_APPRAISER2_ORACLE_TYPE, PV_AUDITOR_ORACLE_TYPE],
      [50, 25, 25],
      ['', '', ''],
      { from: coreTeam }
    );

    const PC_CUSTODIAN_ORACLE_TYPE = await this.plotCustodian.PC_CUSTODIAN_ORACLE_TYPE.call();
    const PC_AUDITOR_ORACLE_TYPE = await this.plotCustodian.PC_AUDITOR_ORACLE_TYPE.call();

    await this.oracles.setApplicationTypeOracleTypes(
      await this.plotCustodian.APPLICATION_TYPE(),
      [PC_CUSTODIAN_ORACLE_TYPE, PC_AUDITOR_ORACLE_TYPE],
      [60, 40],
      ['', ''],
      { from: coreTeam }
    );

    await this.oracles.setOracleTypeMinimalDeposit(PV_APPRAISER_ORACLE_TYPE, ether(30), { from: coreTeam });
    await this.oracles.setOracleTypeMinimalDeposit(PV_APPRAISER2_ORACLE_TYPE, ether(30), { from: coreTeam });
    await this.oracles.setOracleTypeMinimalDeposit(PV_AUDITOR_ORACLE_TYPE, ether(30), { from: coreTeam });
    await this.oracles.setOracleTypeMinimalDeposit(PC_CUSTODIAN_ORACLE_TYPE, ether(30), { from: coreTeam });
    await this.oracles.setOracleTypeMinimalDeposit(PC_AUDITOR_ORACLE_TYPE, ether(30), { from: coreTeam });

    await this.oracles.addOracle(
      multiSigX,
      bob,
      'Bob',
      'MN',
      [],
      [PV_APPRAISER_ORACLE_TYPE, PC_CUSTODIAN_ORACLE_TYPE],
      {
        from: coreTeam
      }
    );
    await this.oracles.addOracle(multiSigX, dan, 'Dan', 'MN', [], [PV_APPRAISER2_ORACLE_TYPE, PC_AUDITOR_ORACLE_TYPE], {
      from: coreTeam
    });
    await this.oracles.addOracle(multiSigX, eve, 'Eve', 'MN', [], [PV_AUDITOR_ORACLE_TYPE], {
      from: coreTeam
    });

    await this.oracles.onOracleStakeChanged(multiSigX, bob, PV_APPRAISER_ORACLE_TYPE, ether(30), {
      from: stakeNotifier
    });
    await this.oracles.onOracleStakeChanged(multiSigX, bob, PC_CUSTODIAN_ORACLE_TYPE, ether(30), {
      from: stakeNotifier
    });
    await this.oracles.onOracleStakeChanged(multiSigX, dan, PV_APPRAISER2_ORACLE_TYPE, ether(30), {
      from: stakeNotifier
    });
    await this.oracles.onOracleStakeChanged(multiSigX, dan, PC_AUDITOR_ORACLE_TYPE, ether(30), { from: stakeNotifier });
    await this.oracles.onOracleStakeChanged(multiSigX, eve, PV_AUDITOR_ORACLE_TYPE, ether(30), { from: stakeNotifier });

    this.galtTokenWeb3 = new web3.eth.Contract(this.galtToken.abi, this.galtToken.address);

    // TODO: move to helper
    this.showGaltDexStatus = async function() {
      const totalSupply = (await this.galtToken.totalSupply()) / 10 ** 18;
      const galtBalanceOfGaltDex = (await this.galtToken.balanceOf(this.galtDex.address)) / 10 ** 18;
      // const galtBalanceOfSpaceDex = (await this.galtToken.balanceOf(this.spaceDex.address)) / 10 ** 18;
      // const spacePriceOnSaleSum = (await this.spaceDex.spacePriceOnSaleSum()) / 10 ** 18;
      const totalSupplyMinusGaltBalance = totalSupply - galtBalanceOfGaltDex;
      const ethBalanceOfGaltDex = (await web3.eth.getBalance(this.galtDex.address)) / 10 ** 18;
      const exchangeRate = (await this.galtDex.exchangeRate('0')) / 10 ** 12;

      console.log(
        'totalSupply',
        totalSupply.toString(10),
        'galtBalanceOfGaltDex',
        galtBalanceOfGaltDex.toString(10),
        'totalSupplyMinusGaltBalance',
        totalSupplyMinusGaltBalance.toString(10),
        'ethBalanceOfGaltDex',
        ethBalanceOfGaltDex.toString(10),
        'exchangeRate',
        exchangeRate.toString(10)
      );
    };

    this.showGaltDexStatus.bind(this);

    this.shouldReceiveGalt = async function(ethToSend) {
      const exchangeRate = await this.galtDex.exchangeRate(0);
      return (ethToSend * exchangeRate) / szabo(1);
    };
    this.shouldReceiveEth = async function(galtToSend) {
      const exchangeRate = await this.galtDex.exchangeRate(0);
      return galtToSend / exchangeRate / szabo(1);
    };

    // TODO: move to helper
    this.valuatePlot = async (tokenId, price) => {
      const res = await this.plotValuation.submitApplication(tokenId, [''], 0, {
        from: alice,
        value: ether(1)
      });
      const aId = res.logs[0].args.id;
      await this.plotValuation.lockApplication(aId, PV_APPRAISER_ORACLE_TYPE, { from: bob });
      await this.plotValuation.lockApplication(aId, PV_APPRAISER2_ORACLE_TYPE, { from: dan });
      await this.plotValuation.valuatePlot(aId, price, { from: bob });
      await this.plotValuation.valuatePlot2(aId, price, { from: dan });

      await this.plotValuation.lockApplication(aId, PV_AUDITOR_ORACLE_TYPE, { from: eve });
      await this.plotValuation.approveValuation(aId, { from: eve });
    };

    // TODO: move to helper
    this.setCustodianForPlot = async (tokenId, custodian) => {
      const auditor = dan;
      const tokenOwner = alice;

      const Action = {
        ATTACH: 0,
        DETACH: 1
      };

      const res = await this.plotCustodian.submitApplication(tokenId, Action.ATTACH, custodian, 0, {
        from: tokenOwner,
        value: ether(1)
      });

      const aId = res.logs[0].args.id;
      await this.plotCustodian.lockApplication(aId, { from: auditor });
      await this.plotCustodian.acceptApplication(aId, { from: custodian });
      await this.spaceToken.approve(this.plotCustodian.address, tokenId, { from: tokenOwner });
      await this.plotCustodian.attachToken(aId, {
        from: alice
      });
      await this.plotCustodian.approveApplication(aId, { from: auditor });
      await this.plotCustodian.approveApplication(aId, { from: tokenOwner });
      await this.plotCustodian.approveApplication(aId, { from: custodian });
      await this.plotCustodian.withdrawToken(aId, { from: tokenOwner });
    };
  });

  it('should be initialized successfully', async function() {
    (await this.galtDex.baseExchangeRate()).toString(10).should.be.eq(szabo(baseExchangeRate).toString(10));
    (await this.galtDex.galtFee()).toString(10).should.be.eq(szabo(fee).toString(10));
    (await this.galtDex.ethFee()).toString(10).should.be.eq(szabo(fee).toString(10));
  });

  describe('#buyGalt()', async () => {
    const ethToSend = parseInt(ether(10), 10);
    const shouldEthFee = (ethToSend / 100) * fee;
    const galtByFirstExchange = ethToSend * baseExchangeRate;

    const galtToSend = ethToSend / 4;
    const shouldGaltFee = (galtToSend / 100) * fee;

    beforeEach(async function() {
      const ethFeeForAmount = await this.galtDex.getEthFeeForAmount(ethToSend, { from: alice });
      ethFeeForAmount.toString(10).should.be.eq(shouldEthFee.toString(10));

      const galtToReceive = await this.galtDex.getExchangeEthAmountForGalt(ethToSend, { from: alice });
      galtToReceive.toString(10).should.be.eq(galtByFirstExchange.toString(10));

      await this.galtDex.exchangeEthToGalt({ from: alice, value: ethToSend });
    });

    it('should be correct balance on buy', async function() {
      // this.showGaltDexStatus();

      let galtBalance = (await this.galtToken.balanceOf(alice)).toString(10);
      galtBalance.should.be.eq(galtByFirstExchange.toString(10));

      (await web3.eth.getBalance(this.galtDex.address)).toString(10).should.be.eq(ethToSend.toString(10));

      (await this.galtDex.ethToGaltSum()).toString(10).should.be.eq(ethToSend.toString(10));

      const shouldReceiveGalt = (await this.shouldReceiveGalt(ethToSend)).toString(10);

      await this.galtDex.exchangeEthToGalt({ from: alice, value: ethToSend });

      // this.showGaltDexStatus();

      galtBalance = (await this.galtToken.balanceOf(alice)).toString(10);
      galtBalance.should.be.eq(new BN(galtByFirstExchange.toString(10)).add(new BN(shouldReceiveGalt)).toString(10));

      (await web3.eth.getBalance(this.galtDex.address)).toString(10).should.be.eq((ethToSend * 2).toString(10));

      (await this.galtDex.ethToGaltSum()).toString(10).should.be.eq((ethToSend * 2).toString(10));
    });

    it('should exchange back to eth', async function() {
      const galtBalance = await this.galtToken.balanceOf(alice);

      const aliceBalance = await web3.eth.getBalance(alice);

      await this.galtToken.approve(this.galtDex.address, galtToSend, { from: alice });

      const allowance = await this.galtToken.allowance(alice, this.galtDex.address);
      allowance.toString(10).should.be.eq(galtToSend.toString(10));

      const shouldReceiveEth = await this.shouldReceiveEth(galtToSend);

      await this.galtDex.exchangeGaltToEth(galtToSend, { from: alice });

      const aliceBalanceDiff = (await web3.eth.getBalance(alice)) - aliceBalance;

      (shouldReceiveEth - aliceBalanceDiff).should.be.lt(parseInt(ether(0.03), 10));

      const galtBalanceAfterExchange = await this.galtToken.balanceOf(alice);

      (galtBalance - galtBalanceAfterExchange).toString(10).should.be.eq(galtToSend.toString(10));

      (await this.galtDex.galtToEthSum()).toString(10).should.be.eq(galtToSend.toString(10));
    });

    it('should receive fee', async function() {
      await this.galtToken.approve(this.galtDex.address, galtToSend, { from: alice });
      await this.galtDex.exchangeGaltToEth(galtToSend, { from: alice });

      let ethFeePayout = await this.galtDex.ethFeePayout();
      ethFeePayout.toString(10).should.be.eq(shouldEthFee.toString(10));

      const coreTeamEthBalance = await web3.eth.getBalance(coreTeam);
      await this.galtDex.withdrawEthFee({ from: coreTeam });
      const coreTeamEthBalanceProfit = (await web3.eth.getBalance(coreTeam)) - coreTeamEthBalance;

      (shouldEthFee - coreTeamEthBalanceProfit).should.be.lt(parseInt(ether(0.003), 10));

      ethFeePayout = await this.galtDex.ethFeePayout();
      ethFeePayout.toString(10).should.be.eq((0).toString(10));

      const totalEthFeePayout = await this.galtDex.ethFeeTotalPayout();
      totalEthFeePayout.toString(10).should.be.eq(shouldEthFee.toString(10));

      let galtFeePayout = await this.galtDex.galtFeePayout();
      galtFeePayout.toString(10).should.be.eq(shouldGaltFee.toString(10));

      await this.galtDex.withdrawGaltFee({ from: coreTeam });
      const coreTeamGaltBalance = await this.galtToken.balanceOf(coreTeam);

      coreTeamGaltBalance.toString(10).should.be.eq(shouldGaltFee.toString(10));

      galtFeePayout = await this.galtDex.galtFeePayout();
      galtFeePayout.toString(10).should.be.eq((0).toString(10));

      const totalGaltFeePayout = await this.galtDex.galtFeeTotalPayout();
      totalGaltFeePayout.toString(10).should.be.eq(shouldGaltFee.toString(10));
    });
  });

  // TODO: use it for future SpaceMortgage
  // describe('spaceDex dependency', async () => {
  //   it('should be correct exchangeRate after exchange on spaceDex', async function() {
  //     const galtDexEchangeRateBefore = await this.galtDex.exchangeRate('0');
  //
  //     await this.galtToken.mint(this.spaceDex.address, ether(100));
  //
  //     await this.spaceToken.mint(alice, {
  //       from: coreTeam
  //     });
  //
  //     const geohashTokenId = '0x0000000000000000000000000000000000000000000000000000000000000000';
  //
  //     await this.valuatePlot(geohashTokenId, ether(5));
  //     await this.setCustodianForPlot(geohashTokenId, bob);
  //     await this.spaceToken.approve(this.spaceDex.address, geohashTokenId, {
  //       from: alice
  //     });
  //
  //     const aliceBalanceBefore = await this.galtTokenWeb3.methods.balanceOf(alice).call();
  //
  //     const geohashPrice = await this.spaceDex.getSpaceTokenActualPriceWithFee(geohashTokenId);
  //     await this.spaceDex.exchangeSpaceToGalt(geohashTokenId, {
  //       from: alice
  //     });
  //
  //     const aliceBalanceAfter = await this.galtTokenWeb3.methods.balanceOf(alice).call();
  //     assertGaltBalanceChanged(aliceBalanceBefore, aliceBalanceAfter, geohashPrice.toString(10));
  //
  //     const galtDexEchangeRateAfter = await this.galtDex.exchangeRate('0');
  //     assert.equal(galtDexEchangeRateBefore.toString(10), galtDexEchangeRateAfter.toString(10));
  //   });
  // });
});
