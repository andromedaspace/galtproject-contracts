const PolygonUtils = artifacts.require('./utils/PolygonUtils.sol');
const LandUtils = artifacts.require('./utils/LandUtils.sol');
const ArrayUtils = artifacts.require('./utils/ArrayUtils.sol');
const SpaceToken = artifacts.require('./SpaceToken.sol');
const SplitMerge = artifacts.require('./SplitMerge.sol');
const Web3 = require('web3');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const chaiBigNumber = require('chai-bignumber')(Web3.utils.BN);
const galt = require('@galtproject/utils');

const web3 = new Web3(SplitMerge.web3.currentProvider);

const { BN } = Web3.utils;
const { zeroAddress, assertRevert } = require('../helpers');

// TODO: move to helpers
Web3.utils.BN.prototype.equal = Web3.utils.BN.prototype.eq;
Web3.utils.BN.prototype.equals = Web3.utils.BN.prototype.eq;

chai.use(chaiAsPromised);
chai.use(chaiBigNumber);
chai.should();

contract.only('SplitMerge', ([coreTeam, alice]) => {
  beforeEach(async function() {
    this.baseContour = ['w9cx6wbuuy', 'w9cx71g9s1', 'w9cwg7dkdr', 'w9cwfqk3f0'].map(galt.geohashToGeohash5);

    this.arrayUtils = await ArrayUtils.new({ from: coreTeam });

    this.landUtils = await LandUtils.new({ from: coreTeam });
    PolygonUtils.link('LandUtils', this.landUtils.address);
    SplitMerge.link('LandUtils', this.landUtils.address);
    SplitMerge.link('ArrayUtils', this.arrayUtils.address);

    this.polygonUtils = await PolygonUtils.new({ from: coreTeam });
    SplitMerge.link('PolygonUtils', this.polygonUtils.address);

    this.spaceToken = await SpaceToken.new('Space Token', 'SPACE', { from: coreTeam });
    this.splitMerge = await SplitMerge.new({ from: coreTeam });

    this.splitMerge.initialize(this.spaceToken.address, zeroAddress, { from: coreTeam });
    this.spaceToken.initialize('SpaceToken', 'SPACE', { from: coreTeam });

    await this.spaceToken.addRoleTo(this.splitMerge.address, 'minter');
    await this.spaceToken.addRoleTo(this.splitMerge.address, 'burner');
    await this.spaceToken.addRoleTo(this.splitMerge.address, 'operator');

    this.spaceTokenWeb3 = new web3.eth.Contract(this.spaceToken.abi, this.spaceToken.address);

    this.logGasUsed = (type, txRes, firstContour, secondContour, thirdContour) => {
      console.log(
        `${type} (${firstContour.length}, ${secondContour.length}, ${thirdContour.length}) gasUsed:`,
        txRes.receipt.gasUsed
      );
    };

    this.splitPackage = async (firstContour, secondContour, baseContour) => {
      const basePackage = baseContour.map(galt.geohashToGeohash5);
      const firstPackage = firstContour.map(galt.geohashToGeohash5);
      const secondPackage = secondContour.map(galt.geohashToGeohash5);

      let res;
      res = await this.splitMerge.initPackage({ from: alice });
      const basePackageId = new BN(res.logs[0].args.id.replace('0x', ''), 'hex').toString(10);
      await this.splitMerge.setPackageContour(basePackageId, basePackage, { from: alice });

      res = await this.splitMerge.splitPackage(basePackageId, secondPackage, firstPackage, {
        from: alice
      });

      this.logGasUsed('split', res, firstPackage, secondPackage, basePackage);
    };

    this.mergePackage = async (firstContour, secondContour, resultContour) => {
      const firstPackage = firstContour.map(galt.geohashToGeohash5);
      const secondPackage = secondContour.map(galt.geohashToGeohash5);
      const resultPackage = resultContour.map(galt.geohashToGeohash5);

      let res;
      res = await this.splitMerge.initPackage({ from: alice });
      const firstPackageId = new BN(res.logs[0].args.id.replace('0x', ''), 'hex').toString(10);
      await this.splitMerge.setPackageContour(firstPackageId, firstPackage, { from: alice });

      res = await this.splitMerge.initPackage({ from: alice });
      const secondPackageId = new BN(res.logs[0].args.id.replace('0x', ''), 'hex').toString(10);
      await this.splitMerge.setPackageContour(secondPackageId, secondPackage, { from: alice });

      res = await this.splitMerge.mergePackage(firstPackageId, secondPackageId, resultPackage, {
        from: alice
      });

      this.logGasUsed('merge', res, firstPackage, secondPackage, resultPackage);
    };
  });

  describe('package', () => {
    it('should creating correctly', async function() {
      let res;

      res = await this.splitMerge.initPackage({ from: alice });

      const packageId = new BN(res.logs[0].args.id.replace('0x', ''), 'hex').toString(10);

      res = await this.spaceToken.ownerOf.call(packageId);
      assert.equal(res, alice);

      await this.splitMerge.setPackageContour(packageId, this.baseContour, { from: alice });

      res = (await this.splitMerge.getPackageContour(packageId)).map(geohash => geohash.toString(10));

      assert.deepEqual(res, this.baseContour.map(geohash => geohash.toString(10)));
    });

    it('should check split correctly', async function() {
      const splitContour1 = ['w9cx63zs88', 'w9cx71gk90', 'w9cx71g9s1', 'w9cwg7dkdr', 'w9cwfqk3f0'].map(
        galt.geohashToGeohash5
      );
      const splitContour2 = ['w9cx63zs88', 'w9cx71gk90', 'w9cx6wbuuy'].map(galt.geohashToGeohash5);
      await this.splitMerge.checkSplitContours(this.baseContour, splitContour1, splitContour2);
    });

    it('should reject incorrect split by duplicate geohash of source contour', async function() {
      const splitContour1 = ['w9cx63zs88', 'w9cx71gk90', 'w9cx71g9s1', 'w9cwg7dkdr', 'w9cwfqk3f0'].map(
        galt.geohashToGeohash5
      );
      const splitContour2 = ['w9cx63zs88', 'w9cx6wbuuy', 'w9cx71gk90', 'w9cx6wbuuy'].map(galt.geohashToGeohash5);
      await assertRevert(this.splitMerge.checkSplitContours(this.baseContour, splitContour1, splitContour2));
    });

    it('should reject incorrect split by unique not exists in source contour error', async function() {
      const splitContour1 = ['w9cx63zs88', 'w9cx71gk90', 'w9cx71g9s1', 'w9cwg7dkdr', 'w9cwfqk3f0'].map(
        galt.geohashToGeohash5
      );
      const splitContour2 = ['w9cx63zs88', 'w9cx71gk90', 'w9cx6wbuuy', 'w9cx6w0uuy'].map(galt.geohashToGeohash5);
      await assertRevert(this.splitMerge.checkSplitContours(this.baseContour, splitContour1, splitContour2));
    });

    it('should reject incorrect split by duplicate element not inside source contour error', async function() {
      const splitContour1 = ['w9cx63zs88', 'w9cx71gk90', 'w9cx71g9s1', 'w9cwg7dkdr', 'w9cwfqk3f0'].map(
        galt.geohashToGeohash5
      );
      const splitContour2 = ['w9cx63zs88', 'w9cx71gk90', 'w9cx6wbuuy', 'w9cx6w0uuy', 'w9cwfqk3f0'].map(
        galt.geohashToGeohash5
      );
      await assertRevert(this.splitMerge.checkSplitContours(this.baseContour, splitContour1, splitContour2));
    });

    it('should check merge correctly', async function() {
      const sourceContour = ['w9cx71g9s1', 'w9cwg7dkdr', 'w9cwfqk3f0', 'w9cx63zs88', 'w9cx71gk90'].map(
        galt.geohashToGeohash5
      );
      const mergeContour = ['w9cx6wbuuy', 'w9cx63zs88', 'w9cx71gk90'].map(galt.geohashToGeohash5);
      await this.splitMerge.checkMergeContours(sourceContour, mergeContour, this.baseContour);
    });

    it('should reject incorrect split by duplicate geohash of merge contour', async function() {
      const sourceContour = ['w9cx71g9s1b', 'w9cwg7dkdrp', 'w9cwfqk3f0m', 'w9cx63zs884', 'w9cx71gk90n'].map(
        galt.geohashToGeohash5
      );
      const mergeContour = ['w9cx6wbuuyu', 'w9cx63zs884', 'w9cx6wbuuyu', 'w9cx71gk90n'].map(galt.geohashToGeohash5);
      await assertRevert(this.splitMerge.checkMergeContours(sourceContour, mergeContour, this.baseContour));
    });

    describe('should handle 4, 6, 4 contours correctly', () => {
      const firstContour = ['w24mjr9xcudz', 'w24mjm2gzc84', 'w24mjmwc2gz8', 'w24mjxbh2rw7'];

      const secondContour = [
        'w24mjr9xcudz',
        'w24mjm2gzc84',
        'w24mhugn2gzd',
        'w24mkgbt2fzs',
        'w24mmedp2fzt',
        'w24mjxbh2rw7'
      ];

      const thirdContour = galt.geohash.contour.mergeContours(firstContour, secondContour, false);

      it('should split 4 => 6, 4', async function() {
        await this.splitPackage(firstContour, secondContour, thirdContour);
      });

      it('should merge 4, 6 => 4', async function() {
        await this.mergePackage(firstContour, secondContour, thirdContour);
      });
    });

    it('should split and then merge correctly', async function() {
      const baseContourAfterSplit = ['w24qe028bvd', 'w24qe0hrwgq', 'w24qe1h88c8', 'w24qe10bfwh'];
      const newContourAfterSplit = [
        'w24qe028bvd',
        'w24qe0hrwgq',
        'w24q7js38f2',
        'w24q6t0ks42',
        'w24qd91d8cx',
        'w24qe10bfwh'
      ];

      // ["w24q7js38f2", "w24q6t0ks42", "w24qd91d8cx", "w24qe1h88c8"]
      let baseContour = galt.geohash.contour.mergeContours(baseContourAfterSplit, newContourAfterSplit);

      baseContour = baseContour.map(galt.geohashToGeohash5);
      const contourToSplitForOldPackage = baseContourAfterSplit.map(galt.geohashToGeohash5);
      const contourToSplitForNewPackage = newContourAfterSplit.map(galt.geohashToGeohash5);

      let res;
      res = await this.splitMerge.initPackage({ from: alice });

      const packageId = new BN(res.logs[0].args.id.replace('0x', ''), 'hex').toString(10);

      await this.splitMerge.setPackageContour(packageId, baseContour, { from: alice });

      // CACHING
      // await this.splitMerge.checkSplitContours(baseContour, contourToSplitForOldPackage, contourToSplitForNewPackage);

      res = await this.splitMerge.splitPackage(packageId, contourToSplitForOldPackage, contourToSplitForNewPackage, {
        from: alice
      });

      this.logGasUsed('split', res, baseContour, contourToSplitForOldPackage, contourToSplitForNewPackage);

      const newPackageId = new BN(res.logs[0].args.id.replace('0x', ''), 'hex').toString(10);

      res = await this.spaceToken.ownerOf.call(packageId);
      assert.equal(res, alice);

      res = await this.splitMerge.getPackageContour.call(packageId);
      assert.deepEqual(res.map(item => item.toString(10)), contourToSplitForOldPackage);

      res = await this.spaceToken.ownerOf.call(newPackageId);
      assert.equal(res, alice);

      res = await this.splitMerge.getPackageContour.call(newPackageId);
      assert.deepEqual(res.map(item => item.toString(10)), contourToSplitForNewPackage);

      res = await this.splitMerge.mergePackage(newPackageId, newPackageId, baseContour, {
        from: alice
      });

      this.logGasUsed('merge', res, contourToSplitForOldPackage, contourToSplitForNewPackage, baseContour);

      res = await this.splitMerge.getPackageContour.call(newPackageId);
      assert.deepEqual(res.map(item => item.toString(10)), baseContour);

      res = await this.spaceToken.exists.call(newPackageId);
      assert.equal(res, false);
    });
  });
});
