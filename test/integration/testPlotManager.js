const PlotManager = artifacts.require('./PlotManager.sol');
const PlotManagerLib = artifacts.require('./PlotManagerLib.sol');
const LandUtils = artifacts.require('./LandUtils.sol');
const SpaceToken = artifacts.require('./SpaceToken.sol');
const SplitMerge = artifacts.require('./SplitMerge.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const Validators = artifacts.require('./Validators.sol');
const ValidatorStakes = artifacts.require('./ValidatorStakes.sol');
const Web3 = require('web3');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const chaiBigNumber = require('chai-bignumber')(Web3.utils.BN);
const galt = require('@galtproject/utils');
const { ether, assertEthBalanceChanged, assertEqualBN, assertRevert, zeroAddress } = require('../helpers');

const web3 = new Web3(PlotManager.web3.currentProvider);
const { BN, utf8ToHex, hexToUtf8 } = Web3.utils;
const NEW_APPLICATION = '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6';
const ANOTHER_APPLICATION = '0x2baf79c183ad5c683c3f4ffdffdd719a123a402f9474acde6ca3060ac1e46095';

// TODO: move to helpers
Web3.utils.BN.prototype.equal = Web3.utils.BN.prototype.eq;
Web3.utils.BN.prototype.equals = Web3.utils.BN.prototype.eq;

chai.use(chaiAsPromised);
chai.use(chaiBigNumber);
chai.should();

const ApplicationStatus = {
  NOT_EXISTS: 0,
  NEW: 1,
  SUBMITTED: 2,
  APPROVED: 3,
  REJECTED: 4,
  REVERTED: 5,
  DISASSEMBLED_BY_APPLICANT: 6,
  DISASSEMBLED_BY_VALIDATOR: 7,
  CLOSED: 8
};

const ValidationStatus = {
  NOT_EXISTS: 0,
  PENDING: 1,
  LOCKED: 2,
  APPROVED: 3,
  REJECTED: 4,
  REVERTED: 5
};

const PaymentMethods = {
  NONE: 0,
  ETH_ONLY: 1,
  GALT_ONLY: 2,
  ETH_AND_GALT: 3
};

const Currency = {
  ETH: 0,
  GALT: 1
};

Object.freeze(ApplicationStatus);
Object.freeze(ValidationStatus);
Object.freeze(PaymentMethods);
Object.freeze(Currency);

/**
 * Alice is an applicant
 * Bob is a validator
 */
contract('PlotManager', accounts => {
  const [coreTeam, galtSpaceOrg, feeManager, multiSigWallet, alice, bob, charlie, dan, eve, frank] = accounts;

  beforeEach(async function() {
    this.initContour = ['qwerqwerqwer', 'ssdfssdfssdf', 'zxcvzxcvzxcv'];
    this.initContour2 = ['dddd', 'bbbb', 'cccc'];
    this.initContour3 = ['qqqq', 'wwww', 'eeee'];
    this.initLedgerIdentifier = 'шц50023中222ائِيل';

    this.contour = this.initContour.map(galt.geohashToNumber);
    this.contour2 = this.initContour2.map(galt.geohashToNumber);
    this.contour3 = this.initContour3.map(galt.geohashToNumber);
    this.credentials = web3.utils.sha3(`Johnj$Galt$123456po`);
    this.ledgerIdentifier = web3.utils.utf8ToHex(this.initLedgerIdentifier);

    this.landUtils = await LandUtils.new({ from: coreTeam });
    PlotManagerLib.link('LandUtils', this.landUtils.address);

    this.plotManagerLib = await PlotManagerLib.new({ from: coreTeam });
    PlotManager.link('PlotManagerLib', this.plotManagerLib.address);

    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.validators = await Validators.new({ from: coreTeam });
    this.validatorStakes = await ValidatorStakes.new({ from: coreTeam });
    this.plotManager = await PlotManager.new({ from: coreTeam });
    this.spaceToken = await SpaceToken.new('Space Token', 'SPACE', { from: coreTeam });
    this.splitMerge = await SplitMerge.new({ from: coreTeam });

    await this.spaceToken.initialize('SpaceToken', 'SPACE', { from: coreTeam });
    await this.plotManager.initialize(
      this.spaceToken.address,
      this.splitMerge.address,
      this.validators.address,
      this.galtToken.address,
      galtSpaceOrg,
      {
        from: coreTeam
      }
    );
    await this.validatorStakes.initialize(this.validators.address, this.galtToken.address, multiSigWallet, {
      from: coreTeam
    });
    await this.splitMerge.initialize(this.spaceToken.address, this.plotManager.address, { from: coreTeam });
    await this.plotManager.setFeeManager(feeManager, true, { from: coreTeam });

    await this.plotManager.setMinimalApplicationFeeInEth(ether(6), { from: feeManager });
    await this.plotManager.setMinimalApplicationFeeInGalt(ether(45), { from: feeManager });
    await this.plotManager.setGaltSpaceEthShare(33, { from: feeManager });
    await this.plotManager.setGaltSpaceGaltShare(13, { from: feeManager });

    await this.spaceToken.addRoleTo(this.plotManager.address, 'minter');
    await this.spaceToken.addRoleTo(this.splitMerge.address, 'minter');
    await this.spaceToken.addRoleTo(this.splitMerge.address, 'operator');

    await this.validators.addRoleTo(coreTeam, await this.validators.ROLE_APPLICATION_TYPE_MANAGER(), {
      from: coreTeam
    });
    await this.validators.addRoleTo(coreTeam, await this.validators.ROLE_VALIDATOR_MANAGER(), {
      from: coreTeam
    });
    await this.validators.addRoleTo(this.validatorStakes.address, await this.validators.ROLE_VALIDATOR_STAKES(), {
      from: coreTeam
    });

    await this.validators.setRoleMinimalDeposit('foo', ether(30), { from: coreTeam });
    await this.validators.setRoleMinimalDeposit('bar', ether(30), { from: coreTeam });
    await this.validators.setRoleMinimalDeposit('buzz', ether(30), { from: coreTeam });
    await this.validators.setRoleMinimalDeposit('human', ether(30), { from: coreTeam });
    await this.validators.setRoleMinimalDeposit('dog', ether(30), { from: coreTeam });
    await this.validators.setRoleMinimalDeposit('cat', ether(30), { from: coreTeam });
    await this.validators.setRoleMinimalDeposit('🦋', ether(30), { from: coreTeam });
    await this.validators.setRoleMinimalDeposit('🦆', ether(30), { from: coreTeam });
    await this.validators.setRoleMinimalDeposit('🦄', ether(30), { from: coreTeam });

    await this.galtToken.mint(alice, ether(10000000000), { from: coreTeam });

    this.plotManagerWeb3 = new web3.eth.Contract(this.plotManager.abi, this.plotManager.address);
    this.spaceTokenWeb3 = new web3.eth.Contract(this.spaceToken.abi, this.spaceToken.address);
    this.galtTokenWeb3 = new web3.eth.Contract(this.galtToken.abi, this.galtToken.address);
  });

  it('should be initialized successfully', async function() {
    (await this.plotManager.minimalApplicationFeeInEth()).toString(10).should.be.a.bignumber.eq(ether(6));
  });

  describe('contract config modifiers', () => {
    describe('#setGaltSpaceRewardsAddress()', () => {
      it('should allow an owner set rewards address', async function() {
        await this.plotManager.setGaltSpaceRewardsAddress(bob, { from: coreTeam });
        // const res = await web3.eth.getStorageAt(this.plotManager.address, 5);
        // assert.equal(res, bob);
      });

      it('should deny any other than a fee manager account set rewards address', async function() {
        await assertRevert(this.plotManager.setGaltSpaceRewardsAddress(bob, { from: alice }));
      });
    });

    describe('#setPaymentMethod()', () => {
      it('should allow a fee manager set a payment method', async function() {
        await this.plotManager.setPaymentMethod(PaymentMethods.ETH_ONLY, { from: feeManager });
        const res = await this.plotManager.paymentMethod();
        assert.equal(res, PaymentMethods.ETH_ONLY);
      });

      it('should deny any other than a fee manager account set a payment method', async function() {
        await assertRevert(this.plotManager.setPaymentMethod(PaymentMethods.ETH_ONLY, { from: coreTeam }));
        const res = await this.plotManager.paymentMethod();
        assert.equal(res, PaymentMethods.ETH_AND_GALT);
      });
    });

    describe('#setMinimalApplicationFeeInEth()', () => {
      it('should allow a fee manager set a new minimum fee in ETH', async function() {
        await this.plotManager.setMinimalApplicationFeeInEth(ether(0.05), { from: feeManager });
        const res = await this.plotManager.minimalApplicationFeeInEth();
        assert.equal(res, ether(0.05));
      });

      it('should deny any other than a fee manager account set fee in ETH', async function() {
        await assertRevert(this.plotManager.setMinimalApplicationFeeInEth(ether(0.05), { from: coreTeam }));
      });
    });

    describe('#setMinimalApplicationFeeInGalt()', () => {
      it('should allow a fee manager set a new minimum fee in GALT', async function() {
        await this.plotManager.setMinimalApplicationFeeInGalt(ether(0.15), { from: feeManager });
        const res = await this.plotManager.minimalApplicationFeeInGalt();
        assert.equal(res, ether(0.15));
      });

      it('should deny any other than a fee manager account set fee in GALT', async function() {
        await assertRevert(this.plotManager.setMinimalApplicationFeeInGalt(ether(0.15), { from: coreTeam }));
      });
    });

    describe('#setSubmissionFeeRate()', () => {
      it('should allow a fee manager set a submission fee rate in ETH and GALT', async function() {
        await this.plotManager.setSubmissionFeeRate(ether(0.02), ether(0.1), { from: feeManager });
        let res = await this.plotManagerWeb3.methods.submissionFeeRateEth().call();
        assert.equal(res, ether(0.02));
        res = await this.plotManagerWeb3.methods.submissionFeeRateGalt().call();
        assert.equal(res, ether(0.1));
      });

      it('should deny any other than a fee manager account set fee in ETH', async function() {
        await assertRevert(
          this.plotManager.setSubmissionFeeRate(ether(0.05), ether(0.05), {
            from: coreTeam
          })
        );
      });
    });

    describe('#setGaltSpaceEthShare()', () => {
      it('should allow fee manager set galtSpace ETH share in percents', async function() {
        await this.plotManager.setGaltSpaceEthShare('42', { from: feeManager });
        const res = await this.plotManager.galtSpaceEthShare();
        assert.equal(res.toString(10), '42');
      });

      it('should deny fee manager set Galt Space EHT share less than 1 percent', async function() {
        await assertRevert(this.plotManager.setGaltSpaceEthShare('0.5', { from: feeManager }));
      });

      it('should deny fee manager set Galt Space EHT share grater than 100 percents', async function() {
        await assertRevert(this.plotManager.setGaltSpaceEthShare('101', { from: feeManager }));
      });

      it('should deny any other than a fee manager account set Galt Space EHT share in percents', async function() {
        await assertRevert(this.plotManager.setGaltSpaceEthShare('20', { from: coreTeam }));
      });
    });

    describe('#setGaltSpaceGaltShare()', () => {
      it('should allow a fee manager set galtSpace Galt share in percents', async function() {
        await this.plotManager.setGaltSpaceGaltShare('42', { from: feeManager });
        const res = await this.plotManager.galtSpaceGaltShare();
        assert.equal(res.toString(10), '42');
      });

      it('should deny a fee manager set Galt Space Galt share less than 1 percent', async function() {
        await assertRevert(this.plotManager.setGaltSpaceGaltShare('0.5', { from: feeManager }));
      });

      it('should deny a fee manager set Galt Space Galt share grater than 100 percents', async function() {
        await assertRevert(this.plotManager.setGaltSpaceGaltShare('101', { from: feeManager }));
      });

      it('should deny any other than a fee manager account set Galt Space EHT share in percents', async function() {
        await assertRevert(this.plotManager.setGaltSpaceGaltShare('20', { from: coreTeam }));
      });
    });
  });

  describe('application modifiers', () => {
    beforeEach(async function() {
      this.resAddRoles = await this.validators.setApplicationTypeRoles(
        NEW_APPLICATION,
        ['🦄', '🦆', '🦋'],
        [25, 30, 45],
        ['', '', ''],
        { from: coreTeam }
      );

      assert(await this.validators.isApplicationTypeReady(NEW_APPLICATION));

      const res = await this.plotManager.applyForPlotOwnership(this.contour, this.credentials, this.ledgerIdentifier, {
        from: alice
      });

      this.aId = res.logs[0].args.id;

      this.payment = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.ETH).call();
    });

    it('should allow change application fields to the owner when status is NEW', async function() {
      const hash = web3.utils.keccak256('AnotherPerson');
      const ledgedIdentifier = 'foo-123';

      await this.plotManager.changeApplicationDetails(this.aId, hash, ledgedIdentifier, {
        from: alice
      });

      const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();

      assert.equal(res.credentialsHash, hash);
      assert.equal(web3.utils.hexToUtf8(res.ledgerIdentifier), ledgedIdentifier);
    });

    it('should allow change application fields to an assigned operator when status is NEW', async function() {
      const hash = web3.utils.keccak256('AnotherPerson');
      const ledgedIdentifier = 'foo-123';

      await this.plotManager.approveOperator(this.aId, frank, { from: alice });
      await this.plotManager.changeApplicationDetails(this.aId, hash, ledgedIdentifier, {
        from: frank
      });

      const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();

      assert.equal(res.credentialsHash, hash);
      assert.equal(web3.utils.hexToUtf8(res.ledgerIdentifier), ledgedIdentifier);
    });

    it('should allow application details hash to the owner when status is REVERTED', async function() {
      await this.plotManager.submitApplication(this.aId, 0, { from: alice, value: this.payment });
      await this.validators.addValidator(bob, 'Bob', 'MN', [], ['🦄'], { from: coreTeam });
      await this.validators.addValidator(dan, 'Dan', 'MN', [], ['🦆'], { from: coreTeam });
      await this.validators.addValidator(eve, 'Eve', 'MN', [], ['🦋'], { from: coreTeam });

      await this.galtToken.approve(this.validatorStakes.address, ether(150), { from: alice });
      await this.validatorStakes.stake(bob, '🦄', ether(30), { from: alice });
      await this.validatorStakes.stake(dan, '🦆', ether(30), { from: alice });
      await this.validatorStakes.stake(eve, '🦋', ether(30), { from: alice });

      await this.plotManager.lockApplicationForReview(this.aId, '🦄', { from: bob });
      await this.plotManager.lockApplicationForReview(this.aId, '🦆', { from: dan });
      await this.plotManager.lockApplicationForReview(this.aId, '🦋', { from: eve });
      await this.plotManager.revertApplication(this.aId, 'dont like it', { from: bob });

      let res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
      assert.equal(res.credentialsHash, this.credentials);
      assert.equal(web3.utils.hexToUtf8(res.ledgerIdentifier), web3.utils.hexToUtf8(this.ledgerIdentifier));

      const hash = web3.utils.keccak256('AnotherPerson');
      const ledgedIdentifier = 'foo-123';

      await this.plotManager.changeApplicationDetails(this.aId, hash, ledgedIdentifier, {
        from: alice
      });

      res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
      assert.equal(res.credentialsHash, hash);
      assert.equal(web3.utils.hexToUtf8(res.ledgerIdentifier), ledgedIdentifier);
    });

    it('should deny hash change to another person', async function() {
      await assertRevert(
        this.plotManager.changeApplicationDetails(this.aId, web3.utils.keccak256('AnotherPerson'), 'foo-bar', {
          from: coreTeam
        })
      );

      const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
      assert.equal(res.credentialsHash, this.credentials);
      assert.equal(web3.utils.hexToUtf8(res.ledgerIdentifier), web3.utils.hexToUtf8(this.ledgerIdentifier));
    });

    it('should deny hash change if applicaiton is submitted', async function() {
      await this.plotManager.submitApplication(this.aId, 0, { from: alice, value: this.payment });
      await assertRevert(
        this.plotManager.changeApplicationDetails(this.aId, web3.utils.keccak256('AnotherPerson'), 'foo-bar', {
          from: alice
        })
      );

      const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
      assert.equal(res.credentialsHash, this.credentials);
      assert.equal(web3.utils.hexToUtf8(res.ledgerIdentifier), web3.utils.hexToUtf8(this.ledgerIdentifier));
    });

    it('should assign 3rd party key to manage the application multiple times', async function() {
      await this.plotManager.approveOperator(this.aId, frank, { from: alice });
      let operator = await this.plotManager.getApplicationOperator(this.aId);
      assert.equal(operator, frank);

      await this.plotManager.approveOperator(this.aId, dan, { from: alice });
      operator = await this.plotManager.getApplicationOperator(this.aId);
      assert.equal(operator, dan);
    });
  });

  describe('application pipeline for GALT payment method', () => {
    beforeEach(async function() {
      this.resAddRoles = await this.validators.setApplicationTypeRoles(
        NEW_APPLICATION,
        ['🦄', '🦆', '🦋'],
        [25, 30, 45],
        ['', '', ''],
        { from: coreTeam }
      );
      const res = await this.plotManager.applyForPlotOwnership(this.contour, this.credentials, this.ledgerIdentifier, {
        from: alice
      });

      this.aId = res.logs[0].args.id;
    });

    describe('#applyForPlotOwnership() Galt', () => {
      it('should provide methods to create and read an application', async function() {
        const res2 = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        const res3 = await this.splitMerge.getPackageContour(
          '0x0000000000000000000000000000000000000000000000000000000000000000'
        );

        // assertions
        for (let i = 0; i < res3.length; i++) {
          galt.numberToGeohash(res3[i].toString(10)).should.be.equal(this.initContour[i]);
        }

        assert.equal(res2.status, 1);
        assert.equal(res2.applicant.toLowerCase(), alice);
        assert.equal(web3.utils.hexToUtf8(res2.ledgerIdentifier), this.initLedgerIdentifier);
      });
    });

    describe('#submitApplication()', () => {
      beforeEach(async function() {
        const expectedFee = await this.plotManagerWeb3.methods.getSubmissionFee(this.aId, Currency.GALT).call();

        this.fee = new BN(expectedFee).add(new BN(ether(6))).toString(10);
        this.deposit = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.GALT).call();
        await this.galtToken.approve(this.plotManager.address, this.fee, { from: alice });
      });

      it('should submit applications in galt', async function() {
        await this.plotManager.submitApplication(this.aId, this.fee, { from: alice, value: this.deposit });
      });

      describe('payable', () => {
        it('should split fee between GaltSpace and Validator', async function() {
          await this.plotManager.submitApplication(this.aId, this.fee, { from: alice });
          const res4 = await this.plotManagerWeb3.methods.getApplicationFees(this.aId).call();
          assert.equal(res4.currency, Currency.GALT);
          assert.equal(res4.validatorsReward, '22620000000000000000');
          assert.equal(res4.galtSpaceReward, '3380000000000000000');
        });

        it('should reject fees not equal returned from getter', async function() {
          await assertRevert(
            this.plotManager.submitApplication(this.aId, '123123123123', { from: alice, value: this.deposit })
          );
        });

        it('should calculate validator rewards according to their roles share', async function() {
          await this.validators.deleteApplicationType(NEW_APPLICATION, { from: coreTeam });
          this.resAddRoles = await this.validators.setApplicationTypeRoles(
            NEW_APPLICATION,
            ['cat', 'dog', 'human'],
            [52, 47, 1],
            ['', '', ''],
            { from: coreTeam }
          );

          let res = await this.plotManager.applyForPlotOwnership(
            this.contour2,
            this.credentials,
            this.ledgerIdentifier,
            { from: alice }
          );
          const aId = res.logs[0].args.id;

          const expectedFee = await this.plotManagerWeb3.methods.getSubmissionFee(aId, Currency.GALT).call();
          const fee = new BN(expectedFee).add(new BN(ether(6))).toString(10);
          await this.galtToken.approve(this.plotManager.address, fee, { from: alice });
          await this.plotManager.submitApplication(aId, fee, { from: alice });

          res = await this.plotManagerWeb3.methods.getApplicationFees(aId).call();
          assert.equal(res.status, ApplicationStatus.SUBMITTED);
          assert.equal(res.currency, Currency.GALT);
          res.validatorsReward.should.be.a.bignumber.eq(new BN('22620000000000000000'));
          res.galtSpaceReward.should.be.a.bignumber.eq(new BN('3380000000000000000'));

          res = await this.plotManagerWeb3.methods.getApplicationById(aId).call();
          assert.sameMembers(res.assignedValidatorRoles.map(hexToUtf8), ['cat', 'dog', 'human']);

          res = await this.plotManagerWeb3.methods.getApplicationValidator(aId, utf8ToHex('cat')).call();
          assert.equal(res.reward.toString(), '11762400000000000000');

          res = await this.plotManagerWeb3.methods.getApplicationValidator(aId, utf8ToHex('dog')).call();
          assert.equal(res.reward.toString(), '10631400000000000000');

          res = await this.plotManagerWeb3.methods.getApplicationValidator(aId, utf8ToHex('human')).call();
          assert.equal(res.reward.toString(), '226200000000000000');
        });
      });
    });

    describe('#closeApplication()', () => {
      describe('with status REVERTED', () => {
        it('should change status to CLOSED', async function() {
          await this.validators.addValidator(charlie, 'Charlie', 'MN', [], ['🦄'], { from: coreTeam });
          await this.validators.addValidator(dan, 'Dan', 'MN', [], ['🦆'], { from: coreTeam });
          await this.validators.addValidator(eve, 'Eve', 'MN', [], ['🦋'], { from: coreTeam });

          await this.galtToken.approve(this.validatorStakes.address, ether(150), { from: alice });
          await this.validatorStakes.stake(charlie, '🦄', ether(30), { from: alice });
          await this.validatorStakes.stake(dan, '🦆', ether(30), { from: alice });
          await this.validatorStakes.stake(eve, '🦋', ether(30), { from: alice });

          const payment = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.ETH).call();
          await this.plotManager.submitApplication(this.aId, 0, { from: alice, value: payment });
          await this.plotManager.lockApplicationForReview(this.aId, '🦄', { from: charlie });
          await this.plotManager.lockApplicationForReview(this.aId, '🦆', { from: dan });
          await this.plotManager.lockApplicationForReview(this.aId, '🦋', { from: eve });
          await this.plotManager.revertApplication(this.aId, 'dont like it', { from: charlie });
          await this.plotManager.closeApplication(this.aId, { from: alice });

          const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
          assert.equal(res.status, ApplicationStatus.CLOSED);
        });
      });
    });

    describe.skip('#resubmitApplication()', () => {
      beforeEach(async function() {
        await this.validators.deleteApplicationType(NEW_APPLICATION, { from: coreTeam });
        this.resAddRoles = await this.validators.setApplicationTypeRoles(
          NEW_APPLICATION,
          ['cat', 'dog', 'human'],
          [52, 47, 1],
          ['', '', ''],
          { from: coreTeam }
        );
        await this.validators.addValidator(bob, 'Bob', 'MN', [], ['human'], { from: coreTeam });
        await this.validators.addValidator(charlie, 'Charlie', 'MN', [], ['human'], { from: coreTeam });

        await this.validators.addValidator(dan, 'Dan', 'MN', [], ['cat'], { from: coreTeam });
        await this.validators.addValidator(eve, 'Eve', 'MN', [], ['dog'], { from: coreTeam });

        await this.galtToken.approve(this.validatorStakes.address, ether(150), { from: alice });
        await this.validatorStakes.stake(bob, 'human', ether(30), { from: alice });
        await this.validatorStakes.stake(dan, 'human', ether(30), { from: alice });
        await this.validatorStakes.stake(eve, 'cat', ether(30), { from: alice });
        await this.validatorStakes.stake(eve, 'dog', ether(30), { from: alice });

        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.NEW);

        const galts = await this.plotManagerWeb3.methods.getSubmissionFee(this.aId, Currency.GALT).call();
        const eths = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.GALT).call();

        await this.galtToken.approve(this.plotManager.address, galts, { from: alice });
        await this.plotManager.submitApplication(this.aId, galts, { from: alice, value: eths });

        await this.plotManager.lockApplicationForReview(this.aId, 'human', { from: bob });
        await this.plotManager.lockApplicationForReview(this.aId, 'cat', { from: dan });
        await this.plotManager.lockApplicationForReview(this.aId, 'dog', { from: eve });
        await this.plotManager.approveApplication(this.aId, this.credentials, { from: eve });
        await this.plotManager.revertApplication(this.aId, 'blah', { from: bob });
      });

      // TODO: replace with "when areaWeight increased" (require additional payment)
      describe.skip('when new geohashes were added', () => {
        beforeEach(async function() {
          const geohashes = ['sezu112c', 'sezu113b1'].map(galt.geohashToGeohash5);
          await this.plotManager.addGeohashesToApplication(this.aId, geohashes, [], [], {
            from: alice
          });
          this.galts = await this.plotManagerWeb3.methods.getResubmissionFee(this.aId).call();
          assert(this.galts > 0);
        });

        it('should require another payment', async function() {
          await this.plotManager.resubmitApplication(this.aId, this.galts, { from: alice });

          const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
          assert.equal(res.status, ApplicationStatus.SUBMITTED);
        });

        it('should reject on unexpected fee in GALT', async function() {
          await assertRevert(this.plotManager.resubmitApplication(this.aId, 123, { from: alice }));

          const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
          assert.equal(res.status, ApplicationStatus.REVERTED);
        });

        it('should reject on payment both in ETH and GALT', async function() {
          await assertRevert(
            this.plotManager.resubmitApplication(this.aId, this.galts, {
              from: alice,
              value: '123'
            })
          );

          const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
          assert.equal(res.status, ApplicationStatus.REVERTED);
        });
      });

      // TODO: replace with "when areaWeight decreased" (allow withdraw redundant funds)
      describe('when geohashes were removed', () => {
        beforeEach(async function() {
          const geohashes = ['sezu1110'].map(galt.geohashToGeohash5);
          await this.plotManager.removeGeohashesFromApplication(this.aId, geohashes, [], [], {
            from: alice
          });
          this.fee = await this.plotManagerWeb3.methods.getResubmissionFee(this.aId).call();
          assert(this.fee < 0);
        });

        it('should not require another payment', async function() {
          await this.plotManager.resubmitApplication(this.aId, 0, { from: alice });

          const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
          assert.equal(res.status, ApplicationStatus.SUBMITTED);
        });
      });
    });

    // TODO: unskip when areaWeigth be implemented
    describe.skip('#withdrawSubmissionFee()', () => {
      beforeEach(async function() {
        await this.validators.deleteApplicationType(NEW_APPLICATION, { from: coreTeam });
        this.resAddRoles = await this.validators.setApplicationTypeRoles(
          NEW_APPLICATION,
          ['cat', 'dog', 'human'],
          [52, 47, 1],
          ['', '', ''],
          { from: coreTeam }
        );
        await this.validators.addValidator(bob, 'Bob', 'MN', [], ['human'], { from: coreTeam });
        await this.validators.addValidator(charlie, 'Charlie', 'MN', [], ['human'], { from: coreTeam });

        await this.validators.addValidator(dan, 'Dan', 'MN', [], ['cat'], { from: coreTeam });
        await this.validators.addValidator(eve, 'Eve', 'MN', [], ['dog'], { from: coreTeam });

        await this.galtToken.approve(this.validatorStakes.address, ether(150), { from: alice });
        await this.validatorStakes.stake(bob, 'human', ether(30), { from: alice });
        await this.validatorStakes.stake(dan, 'human', ether(30), { from: alice });
        await this.validatorStakes.stake(eve, 'cat', ether(30), { from: alice });
        await this.validatorStakes.stake(eve, 'dog', ether(30), { from: alice });

        await this.plotManager.addGeohashesToApplication(this.aId, [], [], [], { from: alice });
        let geohashes = ['sezu1100', 'sezu1110', 'sezu2200'].map(galt.geohashToGeohash5);
        await this.plotManager.addGeohashesToApplication(this.aId, geohashes, [], [], { from: alice });

        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.NEW);

        const galts = await this.plotManagerWeb3.methods.getSubmissionFee(this.aId, Currency.GALT).call();
        const eths = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.GALT).call();
        await this.galtToken.approve(this.plotManager.address, galts, { from: alice });

        await this.plotManager.submitApplication(this.aId, galts, { from: alice, value: eths });

        await this.plotManager.lockApplicationForReview(this.aId, 'human', { from: bob });
        await this.plotManager.lockApplicationForReview(this.aId, 'cat', { from: dan });
        await this.plotManager.lockApplicationForReview(this.aId, 'dog', { from: eve });
        await this.plotManager.approveApplication(this.aId, this.credentials, { from: eve });
        await this.plotManager.revertApplication(this.aId, 'blah', { from: bob });
        geohashes = ['sezu1100', 'sezu1110'].map(galt.geohashToGeohash5);
        await this.plotManager.removeGeohashesFromApplication(this.aId, geohashes, [], [], {
          from: alice
        });
      });

      it('should allow withdraw unused fee after resubmission', async function() {
        let finance = await this.plotManagerWeb3.methods.getApplicationFees(this.aId).call();
        assert.equal(finance.feeRefundAvailable, 0);

        this.fee = await this.plotManagerWeb3.methods.getResubmissionFee(this.aId).call();

        await this.plotManager.resubmitApplication(this.aId, 0, { from: alice });

        finance = await this.plotManagerWeb3.methods.getApplicationFees(this.aId).call();
        assert.equal(finance.feeRefundAvailable, '20971520000000000000');

        const aliceInitialBalance = new BN((await this.galtToken.balanceOf(alice)).toString(10));
        await this.plotManager.withdrawSubmissionFee(this.aId, { from: alice });
        const aliceFinalBalance = new BN((await this.galtToken.balanceOf(alice)).toString(10));

        assertEqualBN(aliceFinalBalance, aliceInitialBalance.add(new BN('20971520000000000000')));
      });

      it('should reject fee withdrawals before resubmission', async function() {
        await assertRevert(this.plotManager.withdrawSubmissionFee(this.aId, { from: alice }));
      });

      it('should reject on double-refund', async function() {
        await this.plotManager.resubmitApplication(this.aId, 0, { from: alice });
        await this.plotManager.withdrawSubmissionFee(this.aId, { from: alice });
        await assertRevert(this.plotManager.withdrawSubmissionFee(this.aId, { from: alice }));
      });
    });

    describe('claim reward', () => {
      beforeEach(async function() {
        await this.validators.deleteApplicationType(NEW_APPLICATION);
        this.resAddRoles = await this.validators.setApplicationTypeRoles(
          NEW_APPLICATION,
          ['human', 'dog', 'cat'],
          [50, 25, 25],
          ['', '', ''],
          { from: coreTeam }
        );

        let res = await this.plotManager.applyForPlotOwnership(this.contour2, this.credentials, this.ledgerIdentifier, {
          from: alice
        });

        this.aId = res.logs[0].args.id;

        res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.NEW);

        await this.validators.addValidator(bob, 'Bob', 'MN', [], ['human'], { from: coreTeam });
        await this.validators.addValidator(charlie, 'Charlie', 'MN', [], ['human'], { from: coreTeam });

        await this.validators.addValidator(dan, 'Dan', 'MN', [], ['cat'], { from: coreTeam });
        await this.validators.addValidator(eve, 'Eve', 'MN', [], ['dog'], { from: coreTeam });

        await this.galtToken.approve(this.validatorStakes.address, ether(150), { from: alice });
        await this.validatorStakes.stake(bob, 'human', ether(30), { from: alice });
        await this.validatorStakes.stake(charlie, 'human', ether(30), { from: alice });
        await this.validatorStakes.stake(dan, 'cat', ether(30), { from: alice });
        await this.validatorStakes.stake(eve, 'dog', ether(30), { from: alice });

        const fee = await this.plotManagerWeb3.methods.getSubmissionFee(this.aId, Currency.GALT).call();
        const deposit = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.GALT).call();
        await this.galtToken.approve(this.plotManager.address, fee, { from: alice });
        await this.plotManager.submitApplication(this.aId, fee, { from: alice, value: deposit });

        await this.plotManager.lockApplicationForReview(this.aId, 'human', { from: bob });
        await this.plotManager.lockApplicationForReview(this.aId, 'cat', { from: dan });
        await this.plotManager.lockApplicationForReview(this.aId, 'dog', { from: eve });
      });

      describe('on approve', () => {
        beforeEach(async function() {
          await this.plotManager.approveApplication(this.aId, this.credentials, { from: bob });
          await this.plotManager.approveApplication(this.aId, this.credentials, { from: dan });
          await this.plotManager.approveApplication(this.aId, this.credentials, { from: eve });
        });

        it('should allow shareholders claim reward', async function() {
          const bobsInitialBalance = new BN((await this.galtToken.balanceOf(bob)).toString(10));
          const dansInitialBalance = new BN((await this.galtToken.balanceOf(dan)).toString(10));
          const evesInitialBalance = new BN((await this.galtToken.balanceOf(eve)).toString(10));
          const orgsInitialBalance = new BN((await this.galtToken.balanceOf(galtSpaceOrg)).toString(10));

          await this.plotManager.claimValidatorReward(this.aId, { from: bob });
          await this.plotManager.claimValidatorReward(this.aId, { from: dan });
          await this.plotManager.claimValidatorReward(this.aId, { from: eve });
          await this.plotManager.claimGaltSpaceReward(this.aId, { from: galtSpaceOrg });

          const bobsFinalBalance = new BN((await this.galtToken.balanceOf(bob)).toString(10));
          const dansFinalBalance = new BN((await this.galtToken.balanceOf(dan)).toString(10));
          const evesFinalBalance = new BN((await this.galtToken.balanceOf(eve)).toString(10));
          const orgsFinalBalance = new BN((await this.galtToken.balanceOf(galtSpaceOrg)).toString(10));

          const res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('human')).call();
          assert.equal(res.reward.toString(), '8700000000000000000');

          assertEqualBN(bobsFinalBalance, bobsInitialBalance.add(new BN('8700000000000000000')));
          assertEqualBN(dansFinalBalance, dansInitialBalance.add(new BN('4350000000000000000')));
          assertEqualBN(evesFinalBalance, evesInitialBalance.add(new BN('4350000000000000000')));
          assertEqualBN(orgsFinalBalance, orgsInitialBalance.add(new BN('2600000000000000000')));
        });
      });

      describe('on reject', () => {
        beforeEach(async function() {
          await this.plotManager.rejectApplication(this.aId, 'malicious', { from: bob });
        });

        it('should allow shareholders claim reward', async function() {
          const bobsInitialBalance = new BN((await this.galtToken.balanceOf(bob)).toString(10));
          const dansInitialBalance = new BN((await this.galtToken.balanceOf(dan)).toString(10));
          const evesInitialBalance = new BN((await this.galtToken.balanceOf(eve)).toString(10));
          const orgsInitialBalance = new BN((await this.galtToken.balanceOf(galtSpaceOrg)).toString(10));

          await this.plotManager.claimValidatorReward(this.aId, { from: bob });
          await this.plotManager.claimValidatorReward(this.aId, { from: dan });
          await this.plotManager.claimValidatorReward(this.aId, { from: eve });
          await this.plotManager.claimGaltSpaceReward(this.aId, { from: galtSpaceOrg });

          const bobsFinalBalance = new BN((await this.galtToken.balanceOf(bob)).toString(10));
          const dansFinalBalance = new BN((await this.galtToken.balanceOf(dan)).toString(10));
          const evesFinalBalance = new BN((await this.galtToken.balanceOf(eve)).toString(10));
          const orgsFinalBalance = new BN((await this.galtToken.balanceOf(galtSpaceOrg)).toString(10));

          const res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('human')).call();
          assert.equal(res.reward.toString(), '8700000000000000000');

          assertEqualBN(bobsFinalBalance, bobsInitialBalance.add(new BN('8700000000000000000')));
          assertEqualBN(dansFinalBalance, dansInitialBalance.add(new BN('4350000000000000000')));
          assertEqualBN(evesFinalBalance, evesInitialBalance.add(new BN('4350000000000000000')));
          assertEqualBN(orgsFinalBalance, orgsInitialBalance.add(new BN('2600000000000000000')));
        });
      });

      describe('on close', () => {
        it('should allow validators claim reward after reject', async function() {
          await this.plotManager.revertApplication(this.aId, this.credentials, { from: bob });
          await this.plotManager.closeApplication(this.aId, { from: alice });

          const bobsInitialBalance = new BN((await this.galtToken.balanceOf(bob)).toString(10));
          const dansInitialBalance = new BN((await this.galtToken.balanceOf(dan)).toString(10));
          const evesInitialBalance = new BN((await this.galtToken.balanceOf(eve)).toString(10));
          const orgsInitialBalance = new BN((await this.galtToken.balanceOf(galtSpaceOrg)).toString());

          await this.plotManager.claimValidatorReward(this.aId, { from: bob });
          await this.plotManager.claimValidatorReward(this.aId, { from: dan });
          await this.plotManager.claimValidatorReward(this.aId, { from: eve });
          await this.plotManager.claimGaltSpaceReward(this.aId, { from: galtSpaceOrg });

          const bobsFinalBalance = new BN((await this.galtToken.balanceOf(bob)).toString(10));
          const dansFinalBalance = new BN((await this.galtToken.balanceOf(dan)).toString(10));
          const evesFinalBalance = new BN((await this.galtToken.balanceOf(eve)).toString(10));
          const orgsFinalBalance = new BN((await this.galtToken.balanceOf(galtSpaceOrg)).toString(10));

          const res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('human')).call();
          assert.equal(res.reward.toString(), '8700000000000000000');

          assertEqualBN(bobsFinalBalance, bobsInitialBalance.add(new BN('8700000000000000000')));
          assertEqualBN(dansFinalBalance, dansInitialBalance.add(new BN('4350000000000000000')));
          assertEqualBN(evesFinalBalance, evesInitialBalance.add(new BN('4350000000000000000')));
          assertEqualBN(orgsFinalBalance, orgsInitialBalance.add(new BN('2600000000000000000')));
        });
      });
    });
  });

  describe('application pipeline for ETH', () => {
    beforeEach(async function() {
      this.resAddRoles = await this.validators.setApplicationTypeRoles(
        NEW_APPLICATION,
        ['human', 'dog', 'cat'],
        [50, 25, 25],
        ['', '', ''],
        { from: coreTeam }
      );

      let res = await this.plotManager.applyForPlotOwnership(this.contour, this.credentials, this.ledgerIdentifier, {
        from: alice
      });

      this.aId = res.logs[0].args.id;

      res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
      this.packageTokenId = res.packageTokenId;
      assert.equal(res.status, ApplicationStatus.NEW);

      await this.validators.addValidator(bob, 'Bob', 'MN', [], ['human'], { from: coreTeam });
      await this.validators.addValidator(charlie, 'Charlie', 'MN', [], ['human'], { from: coreTeam });

      await this.validators.addValidator(dan, 'Dan', 'MN', [], ['cat'], { from: coreTeam });
      await this.validators.addValidator(eve, 'Eve', 'MN', [], ['dog'], { from: coreTeam });

      await this.galtToken.approve(this.validatorStakes.address, ether(150), { from: alice });
      await this.validatorStakes.stake(bob, 'human', ether(30), { from: alice });
      await this.validatorStakes.stake(charlie, 'human', ether(30), { from: alice });
      await this.validatorStakes.stake(dan, 'cat', ether(30), { from: alice });
      await this.validatorStakes.stake(eve, 'dog', ether(30), { from: alice });
    });

    describe('#applyForPlotOwnership() ETH', () => {
      it('should provide methods to create and read an application', async function() {
        const res2 = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        const res3 = await this.splitMerge.getPackageContour(
          '0x0000000000000000000000000000000000000000000000000000000000000000'
        );

        // assertions
        for (let i = 0; i < res3.length; i++) {
          galt.numberToGeohash(res3[i].toString(10)).should.be.equal(this.initContour[i]);
        }

        assert.equal(res2.status, 1);
        assert.equal(res2.applicant.toLowerCase(), alice);
        assert.equal(web3.utils.hexToUtf8(res2.ledgerIdentifier), this.initLedgerIdentifier);
      });

      // eslint-disable-next-line
      it('should mint a pack, geohash, swap the geohash into the pack and keep it at PlotManager address', async function() {
        let res = await this.spaceToken.totalSupply();
        assert.equal(res.toString(), 1);
        res = await this.spaceToken.balanceOf(this.plotManager.address);
        assert.equal(res.toString(), 1);
        res = await this.spaceToken.ownerOf('0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(res, this.plotManager.address);
        res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert(res, 1);
      });
    });

    describe('#closeApplication()', () => {
      describe('for applications paid by ETH', () => {
        describe('with status REVERTED', () => {
          it('should change status to CLOSED', async function() {
            const payment = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.ETH).call();

            await this.plotManager.submitApplication(this.aId, 0, { from: alice, value: payment });
            await this.plotManager.lockApplicationForReview(this.aId, 'human', { from: bob });
            await this.plotManager.lockApplicationForReview(this.aId, 'cat', { from: dan });
            await this.plotManager.lockApplicationForReview(this.aId, 'dog', { from: eve });
            await this.plotManager.revertApplication(this.aId, 'dont like it', { from: bob });

            let res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
            assert.equal(res.status, ApplicationStatus.REVERTED);

            await this.plotManager.closeApplication(this.aId, { from: alice });

            res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
            assert.equal(res.status, ApplicationStatus.CLOSED);
          });
        });
      });
    });

    describe('#submitApplication()', () => {
      it('should change status of an application from from new to submitted', async function() {
        let res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.NEW);

        const payment = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.ETH).call();

        await this.plotManager.submitApplication(this.aId, 0, { from: alice, value: payment });

        res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);
      });

      it('should reject if status is not new or rejected', async function() {
        let res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.NEW);

        const payment = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.ETH).call();

        await this.plotManager.submitApplication(this.aId, 0, { from: alice, value: payment });
        await this.plotManager.lockApplicationForReview(this.aId, 'human', { from: bob });
        await this.plotManager.approveApplication(this.aId, this.credentials, { from: bob });

        await assertRevert(this.plotManager.submitApplication(this.aId, 0, { from: alice, payment }));

        res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);
      });

      it('should reject if another person tries to submit the application', async function() {
        let res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.NEW);

        const payment = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.ETH).call();

        await assertRevert(this.plotManager.submitApplication(this.aId, 0, { from: bob, value: payment }));

        res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.NEW);
      });

      describe('payable', () => {
        it('should reject applications without payment', async function() {
          await assertRevert(this.plotManager.submitApplication(this.aId, 0, { from: alice, value: 0 }));
        });

        it('should reject applications with payment less than required', async function() {
          const expectedPayment = await this.plotManager.getSubmissionPaymentInEth(this.aId, Currency.ETH);
          const payment = expectedPayment.sub(new BN(ether(1)));

          await assertRevert(this.plotManager.submitApplication(this.aId, 0, { from: alice, value: payment }));
        });

        it('should calculate corresponding validator and coreTeam rewards in Eth', async function() {
          const payment = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.ETH).call();
          await this.plotManager.submitApplication(this.aId, 0, { from: alice, value: payment });

          const res = await this.plotManagerWeb3.methods.getApplicationFees(this.aId).call();
          assert.equal(res.status, ApplicationStatus.SUBMITTED);

          res.validatorsReward.should.be.a.bignumber.eq(new BN('1340000000000000000'));
          res.galtSpaceReward.should.be.a.bignumber.eq(new BN('660000000000000000'));

          const fee = await this.plotManagerWeb3.methods.getSubmissionFee(this.aId, Currency.ETH).call();
          fee.should.be.a.bignumber.eq(new BN('1340000000000000000').add(new BN('660000000000000000')));
        });

        it('should calculate validator rewards according to their roles share', async function() {
          const payment = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.ETH).call();

          await this.plotManager.submitApplication(this.aId, 0, { from: alice, value: payment });

          let res = await this.plotManagerWeb3.methods.getApplicationFees(this.aId).call();
          assert.equal(res.status, ApplicationStatus.SUBMITTED);
          assert.equal(res.currency, Currency.ETH);
          res.validatorsReward.should.be.a.bignumber.eq(new BN('1340000000000000000'));

          res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
          assert.sameMembers(res.assignedValidatorRoles.map(hexToUtf8), ['cat', 'dog', 'human']);

          // 50%
          res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('human')).call();
          assert.equal(res.reward.toString(), '670000000000000000');

          // 25%
          res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('cat')).call();
          assert.equal(res.reward.toString(), '335000000000000000');

          // 25%
          res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('dog')).call();
          assert.equal(res.reward.toString(), '335000000000000000');
        });
      });
    });

    // TODO: unskip when areaWeight implemented
    describe.skip('#resubmitApplication()', () => {
      beforeEach(async function() {
        const geohashes = ['sezu1100', 'sezu1110'].map(galt.geohashToGeohash5);
        await this.plotManager.addGeohashesToApplication(this.aId, geohashes, [], [], { from: alice });

        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.NEW);

        const payment = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.ETH).call();
        await this.plotManager.submitApplication(this.aId, 0, { from: alice, value: payment });
        await this.plotManager.lockApplicationForReview(this.aId, 'human', { from: bob });
        await this.plotManager.lockApplicationForReview(this.aId, 'cat', { from: dan });
        await this.plotManager.lockApplicationForReview(this.aId, 'dog', { from: eve });
        await this.plotManager.approveApplication(this.aId, this.credentials, { from: eve });
        await this.plotManager.revertApplication(this.aId, 'blah', { from: bob });
      });

      describe('when new geohashes were not changed', () => {
        it('should allow submit reverted application to the same validator who reverted it', async function() {
          await this.plotManager.resubmitApplication(this.aId, 0, { from: alice });

          let res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
          assert.equal(res.status, ApplicationStatus.SUBMITTED);

          res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('human')).call();
          assert.equal(res.validator.toLowerCase(), bob);
          assert.equal(res.status, ValidationStatus.LOCKED);

          res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('cat')).call();
          assert.equal(res.validator.toLowerCase(), dan);
          assert.equal(res.status, ValidationStatus.LOCKED);

          res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('dog')).call();
          assert.equal(res.validator.toLowerCase(), eve);
          assert.equal(res.status, ValidationStatus.LOCKED);
        });
      });

      describe('when new geohashes were added', () => {
        beforeEach(async function() {
          const geohashes = ['sezu112c', 'sezu113b1'].map(galt.geohashToGeohash5);
          await this.plotManager.addGeohashesToApplication(this.aId, geohashes, [], [], {
            from: alice
          });
          this.fee = await this.plotManagerWeb3.methods.getResubmissionFee(this.aId).call();
          assert(this.fee > 0);
        });

        it('should require another payment', async function() {
          await this.plotManager.resubmitApplication(this.aId, 0, { from: alice, value: this.fee });

          const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
          assert.equal(res.status, ApplicationStatus.SUBMITTED);
        });

        it('should reject on unexpected fee in ETH', async function() {
          await assertRevert(this.plotManager.resubmitApplication(this.aId, 0, { from: alice, value: 123 }));

          const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
          assert.equal(res.status, ApplicationStatus.REVERTED);
        });

        it('should reject on payment both in ETH and GALT', async function() {
          await assertRevert(this.plotManager.resubmitApplication(this.aId, 123, { from: alice, value: this.fee }));

          const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
          assert.equal(res.status, ApplicationStatus.REVERTED);
        });
      });

      describe('when geohashes were removed', () => {
        beforeEach(async function() {
          const geohashes = ['sezu1110'].map(galt.geohashToGeohash5);
          await this.plotManager.removeGeohashesFromApplication(this.aId, geohashes, [], [], {
            from: alice
          });
          this.fee = await this.plotManagerWeb3.methods.getResubmissionFee(this.aId).call();
          assert(this.fee < 0);
        });

        it('should not require another payment', async function() {
          await this.plotManager.resubmitApplication(this.aId, 0, { from: alice });

          const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
          assert.equal(res.status, ApplicationStatus.SUBMITTED);
        });
      });
    });

    // TODO: unskip when areaWeight implemented
    describe.skip('#withdrawSubmissionFee()', () => {
      beforeEach(async function() {
        let geohashes = ['sezu1100', 'sezu1110', 'sezu2200'].map(galt.geohashToGeohash5);
        await this.plotManager.addGeohashesToApplication(this.aId, geohashes, [], [], { from: alice });

        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.NEW);

        const payment = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.ETH).call();
        await this.plotManager.submitApplication(this.aId, 0, { from: alice, value: payment });
        await this.plotManager.lockApplicationForReview(this.aId, 'human', { from: bob });
        await this.plotManager.lockApplicationForReview(this.aId, 'cat', { from: dan });
        await this.plotManager.lockApplicationForReview(this.aId, 'dog', { from: eve });
        await this.plotManager.approveApplication(this.aId, this.credentials, { from: eve });
        await this.plotManager.revertApplication(this.aId, 'blah', { from: bob });
        geohashes = ['sezu1100', 'sezu1110'].map(galt.geohashToGeohash5);
        await this.plotManager.removeGeohashesFromApplication(this.aId, geohashes, [], [], {
          from: alice
        });
        // TODO: remove one and get refund
      });

      it('should reject fee withdrawals before resubmission', async function() {
        await assertRevert(this.plotManager.withdrawSubmissionFee(this.aId, { from: alice }));
      });

      it('should reject on double-refund', async function() {
        await this.plotManager.resubmitApplication(this.aId, 0, { from: alice });
        await this.plotManager.withdrawSubmissionFee(this.aId, { from: alice });
        await assertRevert(this.plotManager.withdrawSubmissionFee(this.aId, { from: alice }));
      });

      it('should allow withdraw unused fee after resubmission', async function() {
        let finance = await this.plotManagerWeb3.methods.getApplicationFees(this.aId).call();
        assert.equal(finance.feeRefundAvailable, 0);

        this.fee = await this.plotManagerWeb3.methods.getResubmissionFee(this.aId).call();

        await this.plotManager.resubmitApplication(this.aId, 0, { from: alice });

        finance = await this.plotManagerWeb3.methods.getApplicationFees(this.aId).call();
        assert.equal(finance.feeRefundAvailable, '2097152000000000000');

        const aliceInitialBalance = new BN(await web3.eth.getBalance(alice));
        await this.plotManager.withdrawSubmissionFee(this.aId, { from: alice });
        const aliceFinalBalance = new BN(await web3.eth.getBalance(alice));
        // TODO: check balances

        const diffAlice = aliceFinalBalance
          .sub(new BN('2097152000000000000')) // <- the diff
          .sub(aliceInitialBalance)
          .add(new BN('10000000000000000')); // <- 0.01 ether

        const max = new BN('10000000000000000'); // <- 0.01 ether
        const min = new BN('0');

        assert(
          diffAlice.lt(max), // diff < 0.01 ether
          `Expected ${web3.utils.fromWei(diffAlice.toString(10))} to be less than 0.01 ether`
        );

        // gt
        assert(
          diffAlice.gt(min), // diff > 0
          `Expected ${web3.utils.fromWei(diffAlice.toString(10))} to be greater than 0`
        );
      });
    });

    describe('#lockApplicationForReview()', () => {
      beforeEach(async function() {
        this.payment = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.ETH).call();

        await this.plotManager.submitApplication(this.aId, 0, { from: alice, value: this.payment });

        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);
      });

      it('should allow multiple validators of different roles to lock a submitted application', async function() {
        await this.plotManager.lockApplicationForReview(this.aId, 'human', { from: bob });
        await this.plotManager.lockApplicationForReview(this.aId, 'cat', { from: dan });

        let res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);

        res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('human')).call();
        assert.equal(res.validator.toLowerCase(), bob);
        assert.equal(res.status, ValidationStatus.LOCKED);

        res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('cat')).call();
        assert.equal(res.validator.toLowerCase(), dan);
        assert.equal(res.status, ValidationStatus.LOCKED);

        res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('dog')).call();
        assert.equal(res.validator.toLowerCase(), zeroAddress);
        assert.equal(res.status, ValidationStatus.PENDING);
      });

      // eslint-disable-next-line
      it('should deny a validator with the same role to lock an application which is already on consideration', async function() {
        await this.plotManager.lockApplicationForReview(this.aId, 'human', { from: bob });
        await assertRevert(this.plotManager.lockApplicationForReview(this.aId, 'human', { from: charlie }));
      });

      it('should push an application id to the validators list for caching', async function() {
        // submit first
        let res = await this.plotManager.applyForPlotOwnership(this.contour2, this.credentials, this.ledgerIdentifier, {
          from: charlie
        });
        const a1Id = res.logs[0].args.id;
        let payment = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(a1Id, Currency.ETH).call();
        await this.plotManager.submitApplication(a1Id, 0, { from: charlie, value: payment });

        // lock first
        await this.plotManager.lockApplicationForReview(a1Id, 'human', { from: bob });

        // submit second
        res = await this.plotManager.applyForPlotOwnership(this.contour3, this.credentials, this.ledgerIdentifier, {
          from: alice
        });
        const a2Id = res.logs[0].args.id;
        payment = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(a2Id, Currency.ETH).call();

        await this.plotManager.submitApplication(a2Id, 0, { from: alice, value: payment });

        // lock second
        await this.plotManager.lockApplicationForReview(a2Id, 'human', { from: bob });

        res = await this.plotManager.getApplicationsByValidator(bob);
        assert.equal(res.length, 2);
        assert.equal(res[0], a1Id);
        assert.equal(res[1], a2Id);
      });

      it('should deny validator to lock an application which is new', async function() {
        let res = await this.plotManager.applyForPlotOwnership(this.contour2, this.credentials, this.ledgerIdentifier, {
          from: alice
        });
        const a2Id = res.logs[0].args.id;
        await assertRevert(this.plotManager.lockApplicationForReview(a2Id, 'human', { from: charlie }));
        res = await this.plotManagerWeb3.methods.getApplicationById(a2Id).call();
        assert.equal(res.status, ApplicationStatus.NEW);

        res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('human')).call();
        assert.equal(res.validator.toLowerCase(), zeroAddress);
        assert.equal(res.status, ValidationStatus.PENDING);
      });

      it('should deny non-validator to lock an application', async function() {
        await assertRevert(this.plotManager.lockApplicationForReview(this.aId, 'human', { from: coreTeam }));
        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, 2);
      });
    });

    describe('#resetApplicationRole()', () => {
      beforeEach(async function() {
        const payment = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.ETH).call();

        await this.plotManager.submitApplication(this.aId, 0, { from: alice, value: payment });

        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);

        await this.plotManager.lockApplicationForReview(this.aId, 'human', { from: bob });
      });

      it('should should allow a contract owner to unlock an application under consideration', async function() {
        await this.plotManager.resetApplicationRole(this.aId, 'human', { from: coreTeam });

        let res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);

        res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('human')).call();
        assert.equal(res.validator.toLowerCase(), zeroAddress);
        assert.equal(res.status, ValidationStatus.PENDING);
      });

      it('should deny non-owner to unlock an application under consideration', async function() {
        await assertRevert(this.plotManager.resetApplicationRole(this.aId, 'human', { from: charlie }));

        let res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);

        res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('human')).call();
        assert.equal(res.validator.toLowerCase(), bob);
        assert.equal(res.status, ValidationStatus.LOCKED);
      });
    });

    describe('#approveApplication', () => {
      beforeEach(async function() {
        const payment = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.ETH).call();

        await this.plotManager.submitApplication(this.aId, 0, { from: alice, value: payment });

        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);

        await this.plotManager.lockApplicationForReview(this.aId, 'human', { from: bob });
        await this.plotManager.lockApplicationForReview(this.aId, 'cat', { from: dan });
        await this.plotManager.lockApplicationForReview(this.aId, 'dog', { from: eve });
      });

      it('should allow a validator approve application', async function() {
        await this.plotManager.approveApplication(this.aId, this.credentials, { from: bob });
        await this.plotManager.approveApplication(this.aId, this.credentials, { from: dan });

        let res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);

        await this.plotManager.approveApplication(this.aId, this.credentials, { from: eve });

        res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.APPROVED);
      });

      it('should transfer package to an applicant', async function() {
        const packId = '0x0000000000000000000000000000000000000000000000000000000000000000';
        await this.plotManager.approveApplication(this.aId, this.credentials, { from: bob });
        await this.plotManager.approveApplication(this.aId, this.credentials, { from: dan });

        let res = await this.spaceToken.ownerOf(packId);
        assert.equal(res, this.plotManager.address);

        await this.plotManager.approveApplication(this.aId, this.credentials, { from: eve });

        res = await this.spaceToken.ownerOf(packId);
        assert.equal(res, alice);
      });

      it('should deny a validator approve application if hash doesnt match', async function() {
        await assertRevert(this.plotManager.approveApplication(this.aId, `${this.credentials}_foo`, { from: bob }));
        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);
      });

      it('should deny non-validator approve application', async function() {
        await assertRevert(this.plotManager.approveApplication(this.aId, this.credentials, { from: alice }));
        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);
      });

      // eslint-disable-next-line
      it('should deny validator whose role doesnt present in application type to approve application', async function() {
        await this.validators.setApplicationTypeRoles(
          ANOTHER_APPLICATION,
          ['foo', 'bar', 'buzz'],
          [50, 25, 25],
          ['', '', ''],
          { from: coreTeam }
        );

        await this.validators.addValidator(frank, 'Frank', 'MN', [], ['foo'], { from: coreTeam });

        await this.galtToken.approve(this.validatorStakes.address, ether(150), { from: alice });
        await this.validatorStakes.stake(frank, 'foo', ether(30), { from: alice });
        await assertRevert(this.plotManager.approveApplication(this.aId, this.credentials, { from: frank }));
      });

      // eslint-disable-next-line
      it('should deny validator approve application with other than consideration or partially locked status', async function() {
        let res = await this.plotManager.applyForPlotOwnership(this.contour2, this.credentials, this.ledgerIdentifier, {
          from: alice
        });

        const aId = res.logs[0].args.id;
        await assertRevert(this.plotManager.approveApplication(aId, this.credentials, { from: bob }));
        res = await this.plotManagerWeb3.methods.getApplicationById(aId).call();
        assert.equal(res.status, ApplicationStatus.NEW);
      });
    });

    describe('#revertApplication()', () => {
      beforeEach(async function() {
        const payment = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.ETH).call();

        await this.plotManager.submitApplication(this.aId, 0, { from: alice, value: payment });

        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);

        await this.plotManager.lockApplicationForReview(this.aId, 'human', { from: bob });
        await this.plotManager.lockApplicationForReview(this.aId, 'cat', { from: dan });
        await this.plotManager.lockApplicationForReview(this.aId, 'dog', { from: eve });
      });

      it('should allow a validator revert application', async function() {
        await this.plotManager.revertApplication(this.aId, 'it looks suspicious', { from: bob });
        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.REVERTED);
      });

      // eslint-disable-next-line
      it('should deny another assigned validator revert application after it was already reverted', async function() {
        await this.plotManager.revertApplication(this.aId, 'it looks suspicious', { from: bob });
        await assertRevert(this.plotManager.revertApplication(this.aId, 'blah', { from: dan }));
        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.REVERTED);
      });

      it('should not reset validation statuses of another validators', async function() {
        await this.plotManager.approveApplication(this.aId, this.credentials, { from: dan });
        await this.plotManager.revertApplication(this.aId, 'it looks suspicious', { from: eve });

        let res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.REVERTED);

        res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('human')).call();
        assert.equal(res.validator.toLowerCase(), bob);
        assert.equal(res.status, ValidationStatus.LOCKED);

        res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('cat')).call();
        assert.equal(res.validator.toLowerCase(), dan);
        assert.equal(res.status, ValidationStatus.APPROVED);

        res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('dog')).call();
        assert.equal(res.validator.toLowerCase(), eve);
        assert.equal(res.status, ValidationStatus.REVERTED);
      });

      it('should deny non-validator revert application', async function() {
        await assertRevert(this.plotManager.revertApplication(this.aId, 'blah', { from: alice }));
        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);
      });

      it('should deny validator revert an application with non-consideration status', async function() {
        let res = await this.plotManager.applyForPlotOwnership(this.contour2, this.credentials, this.ledgerIdentifier, {
          from: alice
        });
        const aId = res.logs[0].args.id;
        const payment = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.ETH).call();

        await this.plotManager.submitApplication(aId, 0, { from: alice, value: payment });

        await assertRevert(this.plotManager.revertApplication(aId, 'blah', { from: bob }));
        res = await this.plotManagerWeb3.methods.getApplicationById(aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);
      });
    });

    describe('#rejectApplication()', () => {
      beforeEach(async function() {
        const payment = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.ETH).call();

        await this.plotManager.submitApplication(this.aId, 0, { from: alice, value: payment });

        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);

        await this.plotManager.lockApplicationForReview(this.aId, 'human', { from: bob });
        await this.plotManager.lockApplicationForReview(this.aId, 'cat', { from: dan });
        await this.plotManager.lockApplicationForReview(this.aId, 'dog', { from: eve });
      });

      it('should allow a validator reject application', async function() {
        await this.plotManager.rejectApplication(this.aId, 'my reason', { from: bob });
        // TODO: check the message

        let res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.REJECTED);

        res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('human')).call();
        assert.equal(res.validator.toLowerCase(), bob);
        assert.equal(res.status, ValidationStatus.REJECTED);
        assert.equal(res.message, 'my reason');

        res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('cat')).call();
        assert.equal(res.validator.toLowerCase(), dan);
        assert.equal(res.status, ValidationStatus.LOCKED);
        assert.equal(res.message, '');
      });

      it('should deny non-validator reject application', async function() {
        await assertRevert(this.plotManager.rejectApplication(this.aId, 'hey', { from: alice }));
        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);
      });

      it('should deny validator revert an application with non-submitted status', async function() {
        await this.plotManager.revertApplication(this.aId, 'some reason', { from: bob });
        await assertRevert(this.plotManager.rejectApplication(this.aId, 'another reason', { from: bob }));
        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.REVERTED);
      });
    });

    describe('claim reward', () => {
      beforeEach(async function() {
        const payment = await this.plotManagerWeb3.methods.getSubmissionPaymentInEth(this.aId, Currency.ETH).call();

        await this.plotManager.submitApplication(this.aId, 0, { from: alice, value: payment });

        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);

        await this.plotManager.lockApplicationForReview(this.aId, 'human', { from: bob });
        await this.plotManager.lockApplicationForReview(this.aId, 'cat', { from: dan });
        await this.plotManager.lockApplicationForReview(this.aId, 'dog', { from: eve });
      });

      describe('on approve', () => {
        beforeEach(async function() {
          await this.plotManager.approveApplication(this.aId, this.credentials, { from: bob });
          await this.plotManager.approveApplication(this.aId, this.credentials, { from: dan });
          await this.plotManager.approveApplication(this.aId, this.credentials, { from: eve });
        });

        it('should allow shareholders claim reward', async function() {
          const bobsInitialBalance = await web3.eth.getBalance(bob);
          const dansInitialBalance = new BN(await web3.eth.getBalance(dan));
          const evesInitialBalance = new BN(await web3.eth.getBalance(eve));
          const orgsInitialBalance = new BN(await web3.eth.getBalance(galtSpaceOrg));

          await this.plotManager.claimValidatorReward(this.aId, { from: bob });
          await this.plotManager.claimValidatorReward(this.aId, { from: dan });
          await this.plotManager.claimValidatorReward(this.aId, { from: eve });
          await this.plotManager.claimGaltSpaceReward(this.aId, { from: galtSpaceOrg });

          const bobsFinalBalance = await web3.eth.getBalance(bob);
          const dansFinalBalance = new BN(await web3.eth.getBalance(dan));
          const evesFinalBalance = new BN(await web3.eth.getBalance(eve));
          const orgsFinalBalance = new BN(await web3.eth.getBalance(galtSpaceOrg));

          let res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('human')).call();
          assert.equal(res.reward.toString(), '670000000000000000');
          res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('cat')).call();
          assert.equal(res.reward.toString(), '335000000000000000');
          res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('dog')).call();
          assert.equal(res.reward.toString(), '335000000000000000');

          res = await this.plotManagerWeb3.methods.getApplicationFees(this.aId).call();
          assert.equal(res.galtSpaceReward.toString(), '660000000000000000');

          assertEthBalanceChanged(bobsInitialBalance, bobsFinalBalance, ether(0.67));
          assertEthBalanceChanged(dansInitialBalance, dansFinalBalance, ether(0.335));
          assertEthBalanceChanged(evesInitialBalance, evesFinalBalance, ether(0.335));
          assertEthBalanceChanged(orgsInitialBalance, orgsFinalBalance, ether(0.66));
        });
      });

      describe('on reject', () => {
        it('should allow validators claim reward after reject', async function() {
          await this.plotManager.rejectApplication(this.aId, this.credentials, { from: bob });

          const bobsInitialBalance = await web3.eth.getBalance(bob);
          const dansInitialBalance = new BN(await web3.eth.getBalance(dan));
          const evesInitialBalance = new BN(await web3.eth.getBalance(eve));
          const orgsInitialBalance = new BN(await web3.eth.getBalance(galtSpaceOrg));

          await this.plotManager.claimValidatorReward(this.aId, { from: bob });
          await this.plotManager.claimValidatorReward(this.aId, { from: dan });
          await this.plotManager.claimValidatorReward(this.aId, { from: eve });
          await this.plotManager.claimGaltSpaceReward(this.aId, { from: galtSpaceOrg });

          const bobsFinalBalance = await web3.eth.getBalance(bob);
          const dansFinalBalance = new BN(await web3.eth.getBalance(dan));
          const evesFinalBalance = new BN(await web3.eth.getBalance(eve));
          const orgsFinalBalance = new BN(await web3.eth.getBalance(galtSpaceOrg));

          let res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('human')).call();
          assert.equal(res.reward.toString(), '670000000000000000');
          res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('cat')).call();
          assert.equal(res.reward.toString(), '335000000000000000');
          res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('dog')).call();
          assert.equal(res.reward.toString(), '335000000000000000');

          res = await this.plotManagerWeb3.methods.getApplicationFees(this.aId).call();
          assert.equal(res.galtSpaceReward.toString(), '660000000000000000');

          assertEthBalanceChanged(bobsInitialBalance, bobsFinalBalance, ether(0.67));
          assertEthBalanceChanged(dansInitialBalance, dansFinalBalance, ether(0.335));
          assertEthBalanceChanged(evesInitialBalance, evesFinalBalance, ether(0.335));
          assertEthBalanceChanged(orgsInitialBalance, orgsFinalBalance, ether(0.66));
        });
      });

      describe('on reject', () => {
        it('should allow validators claim reward after reject', async function() {
          await this.plotManager.revertApplication(this.aId, 'dont like it', { from: bob });
          await this.plotManager.closeApplication(this.aId, { from: alice });

          const bobsInitialBalance = await web3.eth.getBalance(bob);
          const dansInitialBalance = new BN(await web3.eth.getBalance(dan));
          const evesInitialBalance = new BN(await web3.eth.getBalance(eve));
          const orgsInitialBalance = new BN(await web3.eth.getBalance(galtSpaceOrg));

          await this.plotManager.claimValidatorReward(this.aId, { from: bob });
          await this.plotManager.claimValidatorReward(this.aId, { from: dan });
          await this.plotManager.claimValidatorReward(this.aId, { from: eve });
          await this.plotManager.claimGaltSpaceReward(this.aId, { from: galtSpaceOrg });

          const bobsFinalBalance = await web3.eth.getBalance(bob);
          const dansFinalBalance = new BN(await web3.eth.getBalance(dan));
          const evesFinalBalance = new BN(await web3.eth.getBalance(eve));
          const orgsFinalBalance = new BN(await web3.eth.getBalance(galtSpaceOrg));

          let res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('human')).call();
          assert.equal(res.reward.toString(), '670000000000000000');
          res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('cat')).call();
          assert.equal(res.reward.toString(), '335000000000000000');
          res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('dog')).call();
          assert.equal(res.reward.toString(), '335000000000000000');

          res = await this.plotManagerWeb3.methods.getApplicationFees(this.aId).call();
          assert.equal(res.galtSpaceReward.toString(), '660000000000000000');

          assertEthBalanceChanged(bobsInitialBalance, bobsFinalBalance, ether(0.67));
          assertEthBalanceChanged(dansInitialBalance, dansFinalBalance, ether(0.335));
          assertEthBalanceChanged(evesInitialBalance, evesFinalBalance, ether(0.335));
          assertEthBalanceChanged(orgsInitialBalance, orgsFinalBalance, ether(0.66));
        });
      });
    });
  });
});
