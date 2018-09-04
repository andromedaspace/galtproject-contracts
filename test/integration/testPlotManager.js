const PlotManager = artifacts.require('./PlotManager.sol');
const SpaceToken = artifacts.require('./SpaceToken.sol');
const SplitMerge = artifacts.require('./SplitMerge.sol');
const GaltToken = artifacts.require('./GaltToken.sol');
const Validators = artifacts.require('./Validators.sol');
const Web3 = require('web3');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const chaiBigNumber = require('chai-bignumber')(Web3.utils.BN);
const galt = require('@galtproject/utils');
const { ether, sleep, assertRevert, zeroAddress } = require('../helpers');

const web3 = new Web3(PlotManager.web3.currentProvider);
const { BN, keccak256, utf8ToHex, hexToUtf8 } = Web3.utils;
const NEW_APPLICATION = '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6';
const ANOTHER_APPLICATION = '0x2baf79c183ad5c683c3f4ffdffdd719a123a402f9474acde6ca3060ac1e46095';

// TODO: move to helpers
Web3.utils.BN.prototype.equal = Web3.utils.BN.prototype.eq;
Web3.utils.BN.prototype.equals = Web3.utils.BN.prototype.eq;

chai.use(chaiAsPromised);
chai.use(chaiBigNumber);
chai.should();

const GEOHASH_MASK = new BN('0100000000000000000000000000000000000000000000000000000000000000', 16);
const ApplicationStatus = {
  NOT_EXISTS: 0,
  NEW: 1,
  SUBMITTED: 2,
  APPROVED: 3,
  REJECTED: 4,
  REVERTED: 5,
  DISASSEMBLED: 6,
  REFUNDED: 7,
  COMPLETED: 8,
  CLOSED: 9
};

const ValidationStatus = {
  INTACT: 0,
  LOCKED: 1,
  APPROVED: 2,
  REJECTED: 3,
  REVERTED: 4
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
contract('PlotManager', ([coreTeam, galtSpaceOrg, alice, bob, charlie, dan, eve, frank]) => {
  beforeEach(async function() {
    this.initContour = ['qwerqwerqwer', 'ssdfssdfssdf', 'zxcvzxcvzxcv'];
    this.initLedgerIdentifier = 'шц50023中222ائِيل';

    this.contour = this.initContour.map(galt.geohashToNumber);
    this.credentials = web3.utils.sha3(`Johnj$Galt$123456po`);
    this.ledgerIdentifier = web3.utils.utf8ToHex(this.initLedgerIdentifier);

    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.validators = await Validators.new({ from: coreTeam });
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
    await this.splitMerge.initialize(this.spaceToken.address, this.plotManager.address, { from: coreTeam });

    await this.plotManager.setApplicationFeeInEth(ether(6));
    await this.plotManager.setApplicationFeeInGalt(ether(45));
    await this.plotManager.setGaltSpaceEthShare(33);
    await this.plotManager.setGaltSpaceGaltShare(13);

    await this.spaceToken.addRoleTo(this.plotManager.address, 'minter');
    await this.spaceToken.addRoleTo(this.splitMerge.address, 'minter');
    await this.spaceToken.addRoleTo(this.splitMerge.address, 'operator');

    await this.galtToken.mint(alice, ether(10000), { from: coreTeam });

    this.plotManagerWeb3 = new web3.eth.Contract(this.plotManager.abi, this.plotManager.address);
    this.spaceTokenWeb3 = new web3.eth.Contract(this.spaceToken.abi, this.spaceToken.address);
  });

  it('should be initialized successfully', async function() {
    (await this.plotManager.applicationFeeInEth()).toString(10).should.be.a.bignumber.eq(ether(6));
  });

  describe('contract config modifiers', () => {
    describe('#setGaltSpaceRewardsAddress()', () => {
      it('should allow an owner set rewards address', async function() {
        await this.plotManager.setGaltSpaceRewardsAddress(bob, { from: coreTeam });
        // const res = await web3.eth.getStorageAt(this.plotManager.address, 5);
        // assert.equal(res, bob);
      });

      it('should deny non-owner set rewards address', async function() {
        await assertRevert(this.plotManager.setGaltSpaceRewardsAddress(bob, { from: alice }));
      });
    });

    describe('#setPaymentMethod()', () => {
      it('should allow an owner set a payment method', async function() {
        await this.plotManager.setPaymentMethod(PaymentMethods.ETH_ONLY, { from: coreTeam });
        const res = await this.plotManager.paymentMethod();
        assert.equal(res, PaymentMethods.ETH_ONLY);
      });

      it('should deny non-owner set a payment method', async function() {
        await assertRevert(this.plotManager.setPaymentMethod(PaymentMethods.ETH_ONLY, { from: alice }));
        const res = await this.plotManager.paymentMethod();
        assert.equal(res, PaymentMethods.ETH_AND_GALT);
      });
    });

    describe('#setApplicationFeeInEth()', () => {
      it('should allow an owner set a new minimum fee in ETH', async function() {
        await this.plotManager.setApplicationFeeInEth(ether(0.05), { from: coreTeam });
        const res = await this.plotManager.applicationFeeInEth();
        assert.equal(res, ether(0.05));
      });

      it('should deny any other than owner person set fee in ETH', async function() {
        await assertRevert(this.plotManager.setApplicationFeeInEth(ether(0.05), { from: alice }));
      });
    });

    describe('#setApplicationFeeInGalt()', () => {
      it('should allow an owner set a new minimum fee in GALT', async function() {
        await this.plotManager.setApplicationFeeInGalt(ether(0.15), { from: coreTeam });
        const res = await this.plotManager.applicationFeeInGalt();
        assert.equal(res, ether(0.15));
      });

      it('should deny any other than owner person set fee in GALT', async function() {
        await assertRevert(this.plotManager.setApplicationFeeInGalt(ether(0.15), { from: alice }));
      });
    });

    describe('#setGaltSpaceEthShare()', () => {
      it('should allow an owner set galtSpace ETH share in percents', async function() {
        await this.plotManager.setGaltSpaceEthShare('42', { from: coreTeam });
        const res = await this.plotManager.galtSpaceEthShare();
        assert.equal(res.toString(10), '42');
      });

      it('should deny owner set Galt Space EHT share less than 1 percent', async function() {
        await assertRevert(this.plotManager.setGaltSpaceEthShare('0.5', { from: coreTeam }));
      });

      it('should deny owner set Galt Space EHT share grater than 100 percents', async function() {
        await assertRevert(this.plotManager.setGaltSpaceEthShare('101', { from: coreTeam }));
      });

      it('should deny any other than owner set Galt Space EHT share in percents', async function() {
        await assertRevert(this.plotManager.setGaltSpaceEthShare('20', { from: alice }));
      });
    });

    describe('#setGaltSpaceGaltShare()', () => {
      it('should allow an owner set galtSpace Galt share in percents', async function() {
        await this.plotManager.setGaltSpaceGaltShare('42', { from: coreTeam });
        const res = await this.plotManager.galtSpaceGaltShare();
        assert.equal(res.toString(10), '42');
      });

      it('should deny owner set Galt Space Galt share less than 1 percent', async function() {
        await assertRevert(this.plotManager.setGaltSpaceGaltShare('0.5', { from: coreTeam }));
      });

      it('should deny owner set Galt Space Galt share grater than 100 percents', async function() {
        await assertRevert(this.plotManager.setGaltSpaceGaltShare('101', { from: coreTeam }));
      });

      it('should deny any other than owner set Galt Space EHT share in percents', async function() {
        await assertRevert(this.plotManager.setGaltSpaceGaltShare('20', { from: alice }));
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

      const res = await this.plotManager.applyForPlotOwnership(
        this.contour,
        galt.geohashToGeohash5('sezu06'),
        this.credentials,
        this.ledgerIdentifier,
        web3.utils.asciiToHex('MN'),
        7,
        { from: alice, value: ether(6) }
      );

      this.aId = res.logs[0].args.id;
    });

    it('should allow change application fields to the owner when status is NEW', async function() {
      const hash = web3.utils.keccak256('AnotherPerson');
      const ledgedIdentifier = 'foo-123';
      const country = 'SG';
      const precision = 9;

      await this.plotManager.changeApplicationCredentialsHash(this.aId, hash, { from: alice });
      await this.plotManager.changeApplicationLedgerIdentifier(this.aId, ledgedIdentifier, { from: alice });
      await this.plotManager.changeApplicationCountry(this.aId, country, { from: alice });
      await this.plotManager.changeApplicationPrecision(this.aId, precision, { from: alice });

      const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();

      assert.equal(res.credentialsHash, hash);
      assert.equal(web3.utils.hexToUtf8(res.ledgerIdentifier), ledgedIdentifier);
      assert.equal(web3.utils.hexToAscii(res.country), 'SG');
      assert.equal(res.precision, 9);
    });

    // TODO: implement when revered be ready
    it.skip('should allow change hash to the owner when status is REVERTED', async function() {
      await this.plotManager.submitApplication(this.aId, { from: alice });
      await this.validators.addValidator(bob, 'Bob', 'sezu06', [], ['🦄'], { from: coreTeam });
      await this.plotManager.lockApplicationForReview(this.aId, '🦄', { from: bob });
      await this.plotManager.revertApplication(this.aId, { from: bob });

      let res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
      assert.equal(res.credentialsHash, this.credentials);
      assert.equal(web3.utils.hexToUtf8(res.ledgerIdentifier), web3.utils.hexToUtf8(this.ledgerIdentifier));
      assert.equal(web3.utils.hexToAscii(res.country), 'MN');
      assert.equal(res.precision, 7);

      const hash = web3.utils.keccak256('AnotherPerson');
      const ledgedIdentifier = 'foo-123';
      const country = 'SG';
      const precision = 9;

      await this.plotManager.changeApplicationCredentialsHash(this.aId, hash, { from: alice });
      await this.plotManager.changeApplicationLedgerIdentifier(this.aId, ledgedIdentifier, { from: alice });
      await this.plotManager.changeApplicationCountry(this.aId, country, { from: alice });
      await this.plotManager.changeApplicationPrecision(this.aId, precision, { from: alice });

      res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
      assert.equal(res.credentialsHash, hash);
      assert.equal(web3.utils.hexToUtf8(res.ledgerIdentifier), ledgedIdentifier);
      assert.equal(web3.utils.hexToAscii(res.country), 'SG');
      assert.equal(res.precision, 9);
    });

    it('should deny hash change to another person', async function() {
      await assertRevert(
        this.plotManager.changeApplicationCredentialsHash(this.aId, web3.utils.keccak256('AnotherPerson'), {
          from: coreTeam
        })
      );
      await assertRevert(this.plotManager.changeApplicationLedgerIdentifier(this.aId, 'foo-bar', { from: coreTeam }));
      await assertRevert(this.plotManager.changeApplicationCountry(this.aId, 'SG', { from: coreTeam }));
      await assertRevert(this.plotManager.changeApplicationPrecision(this.aId, 9, { from: coreTeam }));

      const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
      assert.equal(res.credentialsHash, this.credentials);
      assert.equal(web3.utils.hexToUtf8(res.ledgerIdentifier), web3.utils.hexToUtf8(this.ledgerIdentifier));
      assert.equal(web3.utils.hexToAscii(res.country), 'MN');
      assert.equal(res.precision, 7);
    });

    it('should deny hash change if applicaiton is submitted', async function() {
      await this.plotManager.submitApplication(this.aId, { from: alice });
      await assertRevert(
        this.plotManager.changeApplicationCredentialsHash(this.aId, web3.utils.keccak256('AnotherPerson'), {
          from: alice
        })
      );
      await assertRevert(this.plotManager.changeApplicationLedgerIdentifier(this.aId, 'foo-bar', { from: alice }));
      await assertRevert(this.plotManager.changeApplicationCountry(this.aId, 'SG', { from: alice }));
      await assertRevert(this.plotManager.changeApplicationPrecision(this.aId, 9, { from: alice }));

      const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
      assert.equal(res.credentialsHash, this.credentials);
      assert.equal(web3.utils.hexToUtf8(res.ledgerIdentifier), web3.utils.hexToUtf8(this.ledgerIdentifier));
      assert.equal(web3.utils.hexToAscii(res.country), 'MN');
      assert.equal(res.precision, 7);
    });
  });

  describe('application pipeline for GALT payment method', () => {
    describe('#applyForPlotOwnershipGalt()', () => {
      beforeEach(async function() {
        this.resAddRoles = await this.validators.setApplicationTypeRoles(
          NEW_APPLICATION,
          ['🦄', '🦆', '🦋'],
          [25, 30, 45],
          ['', '', ''],
          { from: coreTeam }
        );
        await this.galtToken.approve(this.plotManager.address, ether(47), { from: alice });
        const res = await this.plotManager.applyForPlotOwnershipGalt(
          this.contour,
          galt.geohashToGeohash5('sezu06'),
          this.credentials,
          this.ledgerIdentifier,
          web3.utils.asciiToHex('MN'),
          7,
          ether(47),
          { from: alice }
        );

        this.aId = res.logs[0].args.id;
      });

      it('should provide methods to create and read an application', async function() {
        const res2 = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        const res3 = await this.splitMerge.getPackageContour(
          '0x0200000000000000000000000000000000000000000000000000000000000000'
        );

        // assertions
        for (let i = 0; i < res3.length; i++) {
          galt.numberToGeohash(res3[i].toString(10)).should.be.equal(this.initContour[i]);
        }

        assert.equal(res2.status, 1);
        assert.equal(res2.precision, 7);
        assert.equal(res2.applicant.toLowerCase(), alice);
        assert.equal(web3.utils.hexToAscii(res2.country), 'MN');
        assert.equal(web3.utils.hexToUtf8(res2.ledgerIdentifier), this.initLedgerIdentifier);
      });

      // eslint-disable-next-line
      it('should mint a pack, geohash, swap the geohash into the pack and keep it at PlotManager address', async function() {
        let res = await this.spaceToken.totalSupply();
        assert.equal(res.toString(), 2);
        res = await this.spaceToken.balanceOf(this.plotManager.address);
        assert.equal(res.toString(), 1);
        res = await this.spaceToken.balanceOf(this.splitMerge.address);
        assert.equal(res.toString(), 1);
        res = await this.spaceToken.ownerOf('0x0100000000000000000000000000000000000000000000000000000030dfe806');
        assert.equal(res, this.splitMerge.address);
        res = await this.spaceToken.ownerOf('0x0200000000000000000000000000000000000000000000000000000000000000');
        assert.equal(res, this.plotManager.address);
        res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert(res, 1);
      });

      describe('payable', () => {
        it('should split fee between GaltSpace and Validator', async function() {
          const res4 = await this.plotManagerWeb3.methods.getApplicationFinanceById(this.aId).call();
          assert.equal(res4.currency, Currency.GALT);
          assert.equal(res4.validatorsReward, '40890000000000000000');
          assert.equal(res4.galtSpaceReward, '6110000000000000000');
        });

        it('should reject fees less than the minial', async function() {
          await this.galtToken.approve(this.plotManager.address, ether(37), { from: alice });
          await assertRevert(
            this.plotManager.applyForPlotOwnershipGalt(
              this.contour,
              galt.geohashToGeohash5('sezu07'),
              this.credentials,
              this.ledgerIdentifier,
              web3.utils.asciiToHex('MN'),
              7,
              ether(37),
              { from: alice }
            )
          );
        });

        it('accept fees greater than the minimal', async function() {
          await this.galtToken.approve(this.plotManager.address, ether(87), { from: alice });
          const res = await this.plotManager.applyForPlotOwnershipGalt(
            this.contour,
            galt.geohashToGeohash5('sezu07'),
            this.credentials,
            this.ledgerIdentifier,
            web3.utils.asciiToHex('MN'),
            7,
            ether(87),
            { from: alice }
          );

          this.aId = res.logs[0].args.id;
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

          await this.galtToken.approve(this.plotManager.address, ether(53), { from: alice });
          let res = await this.plotManager.applyForPlotOwnershipGalt(
            this.contour,
            galt.geohashToGeohash5('sezu07'),
            this.credentials,
            this.ledgerIdentifier,
            web3.utils.asciiToHex('MN'),
            7,
            ether(53),
            { from: alice }
          );
          const aId = res.logs[0].args.id;

          res = await this.plotManagerWeb3.methods.getApplicationFinanceById(aId).call();
          assert.equal(res.status, 1);
          assert.equal(res.currency, Currency.GALT);
          res.validatorsReward.should.be.a.bignumber.eq(new BN('46110000000000000000'));
          res.galtSpaceReward.should.be.a.bignumber.eq(new BN('6890000000000000000'));

          res = await this.plotManagerWeb3.methods.getApplicationById(aId).call();
          assert.sameMembers(res.assignedValidatorRoles.map(hexToUtf8), ['cat', 'dog', 'human']);

          res = await this.plotManagerWeb3.methods.getApplicationValidator(aId, utf8ToHex('cat')).call();
          assert.equal(res.reward.toString(), '23977200000000000000');

          res = await this.plotManagerWeb3.methods.getApplicationValidator(aId, utf8ToHex('dog')).call();
          assert.equal(res.reward.toString(), '21671700000000000000');

          res = await this.plotManagerWeb3.methods.getApplicationValidator(aId, utf8ToHex('human')).call();
          assert.equal(res.reward.toString(), '461100000000000000');
        });
      });
    });
  });

  describe.only('application pipeline for ETH', () => {
    beforeEach(async function() {
      this.resAddRoles = await this.validators.setApplicationTypeRoles(
        NEW_APPLICATION,
        ['human', 'dog', 'cat'],
        [50, 25, 25],
        ['', '', ''],
        { from: coreTeam }
      );

      let res = await this.plotManager.applyForPlotOwnership(
        this.contour,
        galt.geohashToGeohash5('sezu06'),
        this.credentials,
        this.ledgerIdentifier,
        web3.utils.asciiToHex('MN'),
        7,
        { from: alice, value: ether(6) }
      );

      this.aId = res.logs[0].args.id;

      res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
      assert.equal(res.status, ApplicationStatus.NEW);

      await this.validators.addValidator(bob, 'Bob', 'MN', [], ['human'], { from: coreTeam });
      await this.validators.addValidator(charlie, 'Charlie', 'MN', [], ['human'], { from: coreTeam });

      await this.validators.addValidator(dan, 'Dan', 'MN', [], ['cat'], { from: coreTeam });
      await this.validators.addValidator(eve, 'Eve', 'MN', [], ['dog'], { from: coreTeam });
    });

    describe('#applyForPlotOwnership()', () => {
      it('should provide methods to create and read an application', async function() {
        const res2 = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        const res3 = await this.splitMerge.getPackageContour(
          '0x0200000000000000000000000000000000000000000000000000000000000000'
        );

        // assertions
        for (let i = 0; i < res3.length; i++) {
          galt.numberToGeohash(res3[i].toString(10)).should.be.equal(this.initContour[i]);
        }

        assert.equal(res2.status, 1);
        assert.equal(res2.precision, 7);
        assert.equal(res2.applicant.toLowerCase(), alice);
        assert.equal(web3.utils.hexToAscii(res2.country), 'MN');
        assert.equal(web3.utils.hexToUtf8(res2.ledgerIdentifier), this.initLedgerIdentifier);
      });

      // eslint-disable-next-line
      it('should mint a pack, geohash, swap the geohash into the pack and keep it at PlotManager address', async function() {
        let res = await this.spaceToken.totalSupply();
        assert.equal(res.toString(), 2);
        res = await this.spaceToken.balanceOf(this.plotManager.address);
        assert.equal(res.toString(), 1);
        res = await this.spaceToken.balanceOf(this.splitMerge.address);
        assert.equal(res.toString(), 1);
        res = await this.spaceToken.ownerOf('0x0100000000000000000000000000000000000000000000000000000030dfe806');
        assert.equal(res, this.splitMerge.address);
        res = await this.spaceToken.ownerOf('0x0200000000000000000000000000000000000000000000000000000000000000');
        assert.equal(res, this.plotManager.address);
        res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert(res, 1);
      });

      describe('payable', () => {
        it('should reject applications without payment', async function() {
          await assertRevert(
            this.plotManager.applyForPlotOwnership(
              this.contour,
              galt.geohashToGeohash5('sezu06'),
              this.credentials,
              this.ledgerIdentifier,
              web3.utils.asciiToHex('MN'),
              7,
              { from: alice }
            )
          );
        });

        it('should reject applications with payment less than required', async function() {
          await assertRevert(
            this.plotManager.applyForPlotOwnership(
              this.contour,
              galt.geohashToGeohash5('sezu06'),
              this.credentials,
              this.ledgerIdentifier,
              web3.utils.asciiToHex('MN'),
              7,
              { from: alice, value: ether(3) }
            )
          );
        });

        it('should allow applications with payment greater than required', async function() {
          await this.plotManager.applyForPlotOwnership(
            this.contour,
            galt.geohashToGeohash5('sezu07'),
            this.credentials,
            this.ledgerIdentifier,
            web3.utils.asciiToHex('MN'),
            7,
            { from: alice, value: ether(7) }
          );
        });

        it('should calculate corresponding validator and coreTeam rewards in Eth', async function() {
          const res = await this.plotManagerWeb3.methods.getApplicationFinanceById(this.aId).call();
          assert.equal(res.status, ApplicationStatus.NEW);
          res.validatorsReward.should.be.a.bignumber.eq(new BN('4020000000000000000'));
          res.galtSpaceReward.should.be.a.bignumber.eq(new BN('1980000000000000000'));
        });

        it('should calculate validator rewards according to their roles share', async function() {
          await this.validators.deleteApplicationType(NEW_APPLICATION, { from: coreTeam });
          this.resAddRoles = await this.validators.setApplicationTypeRoles(
            NEW_APPLICATION,
            ['cat', 'dog', 'human'],
            [52, 33, 15],
            ['', '', ''],
            { from: coreTeam }
          );

          let res = await this.plotManager.applyForPlotOwnership(
            this.contour,
            galt.geohashToGeohash5('sezu07'),
            this.credentials,
            this.ledgerIdentifier,
            web3.utils.asciiToHex('MN'),
            7,
            { from: alice, value: ether(9) }
          );
          const aId = res.logs[0].args.id;

          res = await this.plotManagerWeb3.methods.getApplicationFinanceById(aId).call();
          assert.equal(res.status, 1);
          assert.equal(res.currency, Currency.ETH);
          res.validatorsReward.should.be.a.bignumber.eq(new BN('6030000000000000000'));

          res = await this.plotManagerWeb3.methods.getApplicationById(aId).call();
          assert.sameMembers(res.assignedValidatorRoles.map(hexToUtf8), ['cat', 'dog', 'human']);

          res = await this.plotManagerWeb3.methods.getApplicationValidator(aId, utf8ToHex('cat')).call();
          assert.equal(res.reward.toString(), '3135600000000000000');

          res = await this.plotManagerWeb3.methods.getApplicationValidator(aId, utf8ToHex('dog')).call();
          assert.equal(res.reward.toString(), '1989900000000000000');

          res = await this.plotManagerWeb3.methods.getApplicationValidator(aId, utf8ToHex('human')).call();
          assert.equal(res.reward.toString(), '904500000000000000');
        });
      });
    });

    describe('#addGeohashesToApplication', () => {
      it('should add a list of geohashes', async function() {
        let geohashes = `gbsuv7ztt gbsuv7ztw gbsuv7ztx gbsuv7ztm gbsuv7ztq gbsuv7ztr gbsuv7ztj gbsuv7ztn`;
        geohashes += ` gbsuv7zq gbsuv7zw gbsuv7zy gbsuv7zm gbsuv7zt gbsuv7zv gbsuv7zk gbsuv7zs gbsuv7zu`;
        geohashes = geohashes.split(' ').map(galt.geohashToGeohash5);

        // TODO: pass neighbours and directions
        await this.plotManager.addGeohashesToApplication(this.aId, geohashes, [], [], { from: alice });
      });

      it('should re-use geohash space tokens if they belong to PlotManager', async function() {
        const tokenId = galt.geohashToNumber('sezu05');
        let res = await this.spaceToken.mintGeohash(this.plotManager.address, tokenId.toString(10), {
          from: coreTeam
        });

        let geohashes = `gbsuv7ztt gbsuv7ztw gbsuv7ztx gbsuv7ztm gbsuv7ztq gbsuv7ztr gbsuv7ztj gbsuv7ztn`;
        geohashes = geohashes.split(' ').map(galt.geohashToGeohash5);
        geohashes.push(tokenId.toString());
        await this.plotManager.addGeohashesToApplication(this.aId, geohashes, [], [], { from: alice });

        res = await this.spaceToken.ownerOf(tokenId.xor(GEOHASH_MASK).toString());
        assert.equal(res, this.splitMerge.address);
      });

      it('should reject if already minted token doesnt belong to PlotManager', async function() {
        const tokenId = galt.geohashToNumber('sezu05');
        let res = await this.spaceToken.mintGeohash(bob, tokenId.toString(10), {
          from: coreTeam
        });

        let geohashes = `gbsuv7ztt gbsuv7ztw gbsuv7ztx gbsuv7ztm gbsuv7ztq gbsuv7ztr gbsuv7ztj gbsuv7ztn`;
        geohashes = geohashes.split(' ').map(galt.geohashToGeohash5);
        geohashes.push(tokenId.toString());
        await assertRevert(this.plotManager.addGeohashesToApplication(this.aId, geohashes, [], [], { from: alice }));

        res = await this.spaceToken.ownerOf(tokenId.xor(GEOHASH_MASK).toString());
        assert.equal(res, bob);
      });

      it('should add a list of geohashes if an application status is reverted', async function() {
        let geohashes1 = `gbsuv7ztt gbsuv7ztw gbsuv7ztx gbsuv7ztm gbsuv7ztq gbsuv7ztr gbsuv7ztj gbsuv7ztn`;
        geohashes1 = geohashes1.split(' ').map(galt.geohashToGeohash5);
        const geohashes2 = ['sezu01', 'sezu02'].map(galt.geohashToGeohash5);

        // TODO: pass neighbours and directions
        await this.plotManager.addGeohashesToApplication(this.aId, geohashes1, [], [], { from: alice });

        assert.equal(await this.spaceToken.ownerOf(galt.geohash5ToTokenId(geohashes1[0])), this.splitMerge.address);
        assert.equal(await this.spaceToken.ownerOf(galt.geohash5ToTokenId(geohashes1[1])), this.splitMerge.address);

        await this.plotManager.submitApplication(this.aId, { from: alice });
        await this.plotManager.lockApplicationForReview(this.aId, 'human', { from: bob });
        await this.plotManager.revertApplication(this.aId, 'blah', { from: bob });

        let res = await this.splitMerge.packageGeohashesCount(
          '0x0200000000000000000000000000000000000000000000000000000000000000'
        );
        assert.equal(res, 9);

        await this.plotManager.addGeohashesToApplication(this.aId, geohashes2, [], [], { from: alice });
        res = await this.splitMerge.packageGeohashesCount(
          '0x0200000000000000000000000000000000000000000000000000000000000000'
        );
        assert.equal(res, 11);
      });

      it('should throw if already existing geohashes are passed in', async function() {
        let geohashes1 = `gbsuv7ztt gbsuv7ztw gbsuv7ztx gbsuv7ztm gbsuv7ztq gbsuv7ztr gbsuv7ztj gbsuv7ztn`;
        geohashes1 = geohashes1.split(' ').map(galt.geohashToGeohash5);
        const geohashes2 = ['sezu01', 'gbsuv7ztm'].map(galt.geohashToGeohash5);

        // TODO: pass neighbours and directions
        await this.plotManager.addGeohashesToApplication(this.aId, geohashes1, [], [], { from: alice });

        await assertRevert(this.plotManager.addGeohashesToApplication(this.aId, geohashes2, [], [], { from: alice }));
      });

      it('should reject push from non-owner', async function() {
        let geohashes = `gbsuv7ztt gbsuv7ztw gbsuv7ztx gbsuv7ztm gbsuv7ztq gbsuv7ztr gbsuv7ztj gbsuv7ztn`;
        geohashes = geohashes.split(' ').map(galt.geohashToGeohash5);

        await assertRevert(this.plotManager.addGeohashesToApplication(this.aId, geohashes, [], [], { from: coreTeam }));
      });

      it('should reject push when status is not new or rejected', async function() {
        let geohashes = `gbsuv7ztt gbsuv7ztw gbsuv7ztx gbsuv7ztm gbsuv7ztq gbsuv7ztr gbsuv7ztj gbsuv7ztn`;
        geohashes = geohashes.split(' ').map(galt.geohashToGeohash5);

        await this.plotManager.submitApplication(this.aId, { from: alice });
        await assertRevert(this.plotManager.addGeohashesToApplication(this.aId, geohashes, [], [], { from: alice }));
      });

      // TODO: add check for non allowed symbols on geohash token minting
      it.skip('should reject push if geohash array contains an empty element', async function() {
        let geohashes = `gbsuv7ztt gbsuv7ztw gbsuv7ztx gbsuv7ztm gbsuv7ztq gbsuv7ztr gbsuv7ztj gbsuv7ztn`;
        geohashes = geohashes.split(' ').map(galt.geohashToGeohash5);
        geohashes.push('');

        await assertRevert(this.plotManager.addGeohashesToApplication(this.aId, geohashes, [], [], { from: alice }));
      });
    });

    describe('#submitApplication', () => {
      it('should change status of an application from from new to submitted', async function() {
        let res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.NEW);

        await this.plotManager.submitApplication(this.aId, { from: alice });

        res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);
      });

      // TODO: fix when approve implemented
      it('should allow submit reverted application to the same validator who reverted it', async function() {
        let res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.NEW);

        await this.plotManager.submitApplication(this.aId, { from: alice });
        await this.plotManager.lockApplicationForReview(this.aId, 'human', { from: bob });
        await this.plotManager.revertApplication(this.aId, 'blah', { from: bob });
        await this.plotManager.submitApplication(this.aId, { from: alice });

        res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);

        res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('human')).call();
        assert.equal(res.validator.toLowerCase(), bob);
        assert.equal(res.status, ValidationStatus.LOCKED);
      });

      it('shotuld reject if status is not new or rejected', async function() {
        let res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.NEW);

        await this.plotManager.submitApplication(this.aId, { from: alice });
        await this.plotManager.lockApplicationForReview(this.aId, 'human', { from: bob });
        await this.plotManager.approveApplication(this.aId, this.credentials, { from: bob });

        await assertRevert(this.plotManager.submitApplication(this.aId, { from: alice }));

        res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);
      });

      it('should reject if another person tries to submit the application', async function() {
        let res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.NEW);

        await assertRevert(this.plotManager.submitApplication(this.aId, { from: bob }));

        res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.NEW);
      });
    });

    describe('#lockApplicationForReview', () => {
      beforeEach(async function() {
        await this.plotManager.submitApplication(this.aId, { from: alice });

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
        assert.equal(res.status, ValidationStatus.INTACT);
      });

      // eslint-disable-next-line
      it('should deny a validator with the same role to lock an application which is already on consideration', async function() {
        await this.plotManager.lockApplicationForReview(this.aId, 'human', { from: bob });
        await assertRevert(this.plotManager.lockApplicationForReview(this.aId, 'human', { from: charlie }));
      });

      it('should push an application id to the validators list for caching', async function() {
        // submit first
        let res = await this.plotManager.applyForPlotOwnership(
          this.contour,
          galt.geohashToGeohash5('sezu19'),
          this.credentials,
          this.ledgerIdentifier,
          web3.utils.asciiToHex('MN'),
          7,
          { from: charlie, value: ether(6) }
        );
        const a1Id = res.logs[0].args.id;
        await this.plotManager.submitApplication(a1Id, { from: charlie });

        // lock first
        await this.plotManager.lockApplicationForReview(a1Id, 'human', { from: bob });

        // submit second
        res = await this.plotManager.applyForPlotOwnership(
          this.contour,
          galt.geohashToGeohash5('sezu09'),
          this.credentials,
          this.ledgerIdentifier,
          web3.utils.asciiToHex('MN'),
          7,
          { from: alice, value: ether(6) }
        );
        const a2Id = res.logs[0].args.id;
        await this.plotManager.submitApplication(a2Id, { from: alice });

        // lock second
        await this.plotManager.lockApplicationForReview(a2Id, 'human', { from: bob });

        res = await this.plotManager.getApplicationsByValidator(bob);
        assert.equal(res.length, 2);
        assert.equal(res[0], a1Id);
        assert.equal(res[1], a2Id);
      });

      it('should deny validator to lock an application which is new', async function() {
        let res = await this.plotManager.applyForPlotOwnership(
          this.contour,
          galt.geohashToGeohash5('sezu05'),
          this.credentials,
          this.ledgerIdentifier,
          web3.utils.asciiToHex('MN'),
          7,
          { from: alice, value: ether(6) }
        );
        const a2Id = res.logs[0].args.id;
        await assertRevert(this.plotManager.lockApplicationForReview(a2Id, 'human', { from: charlie }));
        res = await this.plotManagerWeb3.methods.getApplicationById(a2Id).call();
        assert.equal(res.status, ApplicationStatus.NEW);

        res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('human')).call();
        assert.equal(res.validator.toLowerCase(), zeroAddress);
        assert.equal(res.status, ValidationStatus.INTACT);
      });

      it('should deny non-validator to lock an application', async function() {
        await assertRevert(this.plotManager.lockApplicationForReview(this.aId, 'human', { from: coreTeam }));
        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, 2);
      });
    });

    describe('#resetApplicationRole()', () => {
      beforeEach(async function() {
        await this.plotManager.submitApplication(this.aId, { from: alice });

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
        assert.equal(res.status, ValidationStatus.INTACT);
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
        await this.plotManager.submitApplication(this.aId, { from: alice });

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
        const packId = '0x0200000000000000000000000000000000000000000000000000000000000000';
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
        await assertRevert(this.plotManager.approveApplication(this.aId, this.credentials, { from: frank }));
      });

      // eslint-disable-next-line
      it('should deny validator approve application with other than consideration or partially locked status', async function() {
        let res = await this.plotManager.applyForPlotOwnership(
          this.contour,
          galt.geohashToGeohash5('sezu36'),
          this.credentials,
          this.ledgerIdentifier,
          web3.utils.asciiToHex('MN'),
          7,
          { from: alice, value: ether(6) }
        );

        const aId = res.logs[0].args.id;
        await assertRevert(this.plotManager.approveApplication(aId, this.credentials, { from: bob }));
        res = await this.plotManagerWeb3.methods.getApplicationById(aId).call();
        assert.equal(res.status, ApplicationStatus.NEW);
      });
    });

    describe('#revertApplication()', () => {
      beforeEach(async function() {
        await this.plotManager.submitApplication(this.aId, { from: alice });

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

      it('should reset validation statuses of another validators', async function() {
        await this.plotManager.revertApplication(this.aId, 'it looks suspicious', { from: eve });

        let res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.REVERTED);

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

      it('should deny non-validator revert application', async function() {
        await assertRevert(this.plotManager.revertApplication(this.aId, 'blah', { from: alice }));
        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);
      });

      it('should deny validator revert an application with non-consideration status', async function() {
        let res = await this.plotManager.applyForPlotOwnership(
          this.contour,
          galt.geohashToGeohash5('sezu96'),
          this.credentials,
          this.ledgerIdentifier,
          web3.utils.asciiToHex('MN'),
          7,
          { from: alice, value: ether(6) }
        );
        const aId = res.logs[0].args.id;

        await this.plotManager.submitApplication(aId, { from: alice });

        await assertRevert(this.plotManager.revertApplication(aId, 'blah', { from: bob }));
        res = await this.plotManagerWeb3.methods.getApplicationById(aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);
      });
    });

    describe('#rejectApplication()', () => {
      beforeEach(async function() {
        await this.plotManager.submitApplication(this.aId, { from: alice });

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

    describe.skip('#removeGeohashFromApplication()', () => {
      beforeEach(async function() {
        let geohashes = `gbsuv7ztt gbsuv7ztw gbsuv7ztx gbsuv7ztm gbsuv7ztq gbsuv7ztr gbsuv7ztj gbsuv7ztn`;
        geohashes += ` gbsuv7zq gbsuv7zw gbsuv7zy gbsuv7zm gbsuv7zt gbsuv7zv gbsuv7zk gbsuv7zs gbsuv7zu`;
        this.geohashes = geohashes.split(' ').map(galt.geohashToGeohash5);

        await this.plotManager.addGeohashesToApplication(this.aId, this.geohashes, [], [], { from: alice });
      });

      it('should allow owner partially remove geohashes from an application', async function() {
        const geohashesToRemove = this.geohashes.slice(0, 2);
        let res = await this.spaceToken.ownerOf(galt.geohashToTokenId(geohashesToRemove[0]));
        assert.equal(res, this.splitMerge.address);
        res = await this.spaceToken.ownerOf(galt.geohashToTokenId(geohashesToRemove[1]));
        assert.equal(res, this.splitMerge.address);

        res = await this.splitMerge.packageGeohashesCount(
          '0x0200000000000000000000000000000000000000000000000000000000000000'
        );
        assert.equal(res, 18);

        await this.plotManager.removeGeohashesFromApplication(this.aId, geohashesToRemove, [], [], {
          from: alice
        });

        res = await this.spaceToken.ownerOf(galt.geohashToTokenId(geohashesToRemove[0]));
        assert.equal(res, this.plotManager.address);
        res = await this.spaceToken.ownerOf(galt.geohashToTokenId(geohashesToRemove[1]));
        assert.equal(res, this.plotManager.address);

        res = await this.splitMerge.packageGeohashesCount(
          '0x0200000000000000000000000000000000000000000000000000000000000000'
        );
        assert.equal(res, 16);
      });

      it('should set DISASSEMBLED on all geohases remove', async function() {
        let res;

        res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();

        const packageGeohashes = await this.splitMerge.getPackageGeohashes(res.packageTokenId);
        const geohashesToRemove = packageGeohashes.map(tokenId => galt.tokenIdToGeohash(tokenId.toString(10)));

        res = await this.splitMerge.packageGeohashesCount(res.packageTokenId);
        assert.equal(res, 18);

        await this.plotManager.removeGeohashesFromApplication(this.aId, geohashesToRemove, [], [], {
          from: alice
        });

        res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.DISASSEMBLED);

        res = await this.splitMerge.packageGeohashesCount(res.packageTokenId);
        assert.equal(res, 0);
      });
    });

    describe('#cltaimValidatorRewardEth()', () => {
      beforeEach(async function() {
        await this.plotManager.submitApplication(this.aId, { from: alice });

        const res = await this.plotManagerWeb3.methods.getApplicationById(this.aId).call();
        assert.equal(res.status, ApplicationStatus.SUBMITTED);

        await this.plotManager.lockApplicationForReview(this.aId, 'human', { from: bob });
        await this.plotManager.lockApplicationForReview(this.aId, 'cat', { from: dan });
        await this.plotManager.lockApplicationForReview(this.aId, 'dog', { from: eve });
      });

      describe('on approve', () => {
        it('should allow validator claim reward', async function() {
          await this.plotManager.approveApplication(this.aId, this.credentials, { from: bob });
          await this.plotManager.approveApplication(this.aId, this.credentials, { from: dan });
          await this.plotManager.approveApplication(this.aId, this.credentials, { from: eve });

          const bobsInitialBalance = new BN(await web3.eth.getBalance(bob));
          await this.plotManager.claimValidatorReward(this.aId, Currency.ETH, { from: bob });
          const bobsFinalBalance = new BN(await web3.eth.getBalance(bob));

          const res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('human')).call();
          assert.equal(res.reward.toString(), '2010000000000000000');

          // bobs fee is around (100 - 33) / 100 * 6 ether * 50%  = 1005000000000000000 wei
          // assume that the commission paid by bob isn't greater than 0.1 ether

          const diff = bobsFinalBalance
            .sub(new BN('2010000000000000000')) // <- the diff
            .sub(bobsInitialBalance)
            .add(new BN('10000000000000000')); // <- 0.01 ether

          const max = new BN('10000000000000000'); // <- 0.01 ether
          const min = new BN('0');

          assert(
            diff.lt(max), // diff < 0.01 ether
            `Expected ${web3.utils.fromWei(diff.toString(10))} to be less than 0.01 ether`
          );

          assert(
            diff.gt(min), // diff > 0
            `Expected ${web3.utils.fromWei(diff.toString(10))} to be greater than 0`
          );
        });
      });

      describe('on reject', () => {
        // TODO: fix when disassembling be ready
        it.skip('should allow validator claim reward after reject', async function() {
          await this.plotManager.rejectApplication(this.aId, this.credentials, { from: bob });

          const bobsInitialBalance = new BN(await web3.eth.getBalance(bob));
          await this.plotManager.claimValidatorReward(this.aId, Currency.ETH, { from: bob });
          const bobsFinalBalance = new BN(await web3.eth.getBalance(bob));

          const res = await this.plotManagerWeb3.methods.getApplicationValidator(this.aId, utf8ToHex('human')).call();
          assert.equal(res.reward.toString(), '2010000000000000000');

          // bobs fee is around (100 - 33) / 100 * 6 ether * 50%  = 1005000000000000000 wei
          // assume that the commission paid by bob isn't greater than 0.1 ether

          const diff = bobsFinalBalance
            .sub(new BN('2010000000000000000')) // <- the diff
            .sub(bobsInitialBalance)
            .add(new BN('10000000000000000')); // <- 0.01 ether

          const max = new BN('10000000000000000'); // <- 0.01 ether
          const min = new BN('0');

          assert(
            diff.lt(max), // diff < 0.01 ether
            `Expected ${web3.utils.fromWei(diff.toString(10))} to be less than 0.01 ether`
          );

          assert(
            diff.gt(min), // diff > 0
            `Expected ${web3.utils.fromWei(diff.toString(10))} to be greater than 0`
          );
        });
      });
    });

    describe.skip('#claimGaltSpaceRewardEth()', () => {
      beforeEach(async function() {
        await this.plotManager.submitApplication(this.aId, { from: alice });
        await this.plotManager.addValidator(bob, 'Bob', 'ID', { from: coreTeam });
        await this.plotManager.lockApplicationForReview(this.aId, { from: bob });
        await this.plotManager.approveApplication(this.aId, this.credentials, { from: bob });
        await this.plotManager.claimValidatorRewardEth(this.aId, { from: bob });
      });

      it('should allow validator claim reward', async function() {
        const plotManagerInitialBalance = new BN(await web3.eth.getBalance(this.plotManager.address));
        const galtSpaceOrgInitialBalance = new BN(await web3.eth.getBalance(galtSpaceOrg));
        await this.plotManager.claimGaltSpaceRewardEth(this.aId, { from: galtSpaceOrg });
        const galtSpaceOrgFinalBalance = new BN(await web3.eth.getBalance(galtSpaceOrg));
        const plotManagerFinalBalance = new BN(await web3.eth.getBalance(this.plotManager.address));

        // galtSpaceOrg fee is around 24 / 100 * 6 ether = 1440000000000000000 wei
        // assume that the commission paid by bob isn't greater than 0.1 ether
        assert(
          galtSpaceOrgInitialBalance
            .add(new BN('1440000000000000000'))
            .sub(new BN(ether(0.1)))
            .lt(galtSpaceOrgFinalBalance)
        );
        assert(
          galtSpaceOrgInitialBalance
            .add(new BN('1440000000000000000'))
            .add(new BN(ether(0.1)))
            .gt(galtSpaceOrgFinalBalance)
        );
        assert(plotManagerInitialBalance.eq(new BN('1440000000000000000')));
        assert(plotManagerFinalBalance.eq(new BN('0')));
      });
    });
  });
});
