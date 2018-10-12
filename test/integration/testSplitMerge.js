const PlotManager = artifacts.require('./PlotManager.sol');
const PlotManagerLib = artifacts.require('./PlotManagerLib.sol');
const LandUtils = artifacts.require('./LandUtils.sol');
const SpaceToken = artifacts.require('./SpaceToken.sol');
const SplitMerge = artifacts.require('./SplitMerge.sol');
const Web3 = require('web3');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const chaiBigNumber = require('chai-bignumber')(Web3.utils.BN);
const galt = require('@galtproject/utils');
const pIteration = require('p-iteration');

const web3 = new Web3(PlotManager.web3.currentProvider);

const { BN } = Web3.utils;

// TODO: move to helpers
Web3.utils.BN.prototype.equal = Web3.utils.BN.prototype.eq;
Web3.utils.BN.prototype.equals = Web3.utils.BN.prototype.eq;

chai.use(chaiAsPromised);
chai.use(chaiBigNumber);
chai.should();

contract('SplitMerge', ([coreTeam, alice, bob]) => {
  beforeEach(async function() {
    this.initFirstGeohash = 'sezu05';
    this.firstGeohash = galt.geohashToGeohash5(this.initFirstGeohash);
    this.initContour = ['qwerqwerqwer', 'ssdfssdfssdf', 'zxcvzxcvzxcv'];

    this.firstGeohashTokenId = galt.geohashToTokenId(this.initFirstGeohash);
    console.log('this.firstGeohashTokenId', this.firstGeohashTokenId);
    this.contour = this.initContour.map(galt.geohashToGeohash5);

    this.landUtils = await LandUtils.new({ from: coreTeam });
    PlotManagerLib.link('LandUtils', this.landUtils.address);

    this.plotManagerLib = await PlotManagerLib.new({ from: coreTeam });
    PlotManager.link('PlotManagerLib', this.plotManagerLib.address);

    this.spaceToken = await SpaceToken.new('Space Token', 'SPACE', { from: coreTeam });
    this.splitMerge = await SplitMerge.new({ from: coreTeam });

    this.plotManager = await PlotManager.new({ from: coreTeam });

    this.spaceToken.initialize('SpaceToken', 'SPACE', { from: coreTeam });
    this.splitMerge.initialize(this.spaceToken.address, this.plotManager.address, { from: coreTeam });

    await this.spaceToken.addRoleTo(this.splitMerge.address, 'minter');
    await this.spaceToken.addRoleTo(this.splitMerge.address, 'burner');
    await this.spaceToken.addRoleTo(this.splitMerge.address, 'operator');

    this.plotManagerWeb3 = new web3.eth.Contract(this.plotManager.abi, this.plotManager.address);
    this.spaceTokenWeb3 = new web3.eth.Contract(this.spaceToken.abi, this.spaceToken.address);
  });

  describe('package', () => {
    it('should creating correctly', async function() {
      let res;
      // TODO: remove console.log lines when the tests work
      // console.log('spaceToken.mintGeohash', alice, this.firstGeohash);
      res = await this.spaceToken.mintGeohash(alice, this.firstGeohash, { from: coreTeam });

      res = await this.splitMerge.initPackage(this.firstGeohashTokenId, { from: alice });

      const packageId = new BN(res.logs[0].args.id.replace('0x', ''), 'hex').toString(10);
      // console.log('packageId', packageId);

      res = await this.spaceToken.ownerOf.call(packageId);
      assert.equal(res, alice);

      // console.log('setPackageContour', packageId, this.contour);
      await this.splitMerge.setPackageContour(packageId, this.contour, { from: alice });

      const geohashes = this.contour;

      const geohashesTokenIds = [];
      const neighborsTokenIds = [];
      const directions = [];

      await pIteration.forEach(geohashes, async geohash => {
        // console.log('mint', geohash);
        res = await this.spaceToken.mintGeohash(alice, geohash, { from: coreTeam });

        geohashesTokenIds.push(galt.geohash5ToTokenId(geohash));
        neighborsTokenIds.push(galt.geohash5ToTokenId(geohash));
        directions.push(web3.utils.asciiToHex('N'));
      });

      // console.log('addGeohashesToPackage', packageId, geohashesTokenIds, neighborsTokenIds, directions);
      await this.splitMerge.addGeohashesToPackage(packageId, geohashesTokenIds, neighborsTokenIds, directions, {
        from: alice
      });

      res = await this.splitMerge.getPackageGeohashesCount.call(packageId);
      assert.equal(res.toString(10), (geohashesTokenIds.length + 1).toString(10));

      res = await this.spaceToken.ownerOf.call(packageId);
      assert.equal(res, alice);

      await pIteration.forEach(geohashesTokenIds, async geohashTokenId => {
        res = await this.spaceToken.ownerOf.call(geohashTokenId);
        assert.equal(res, this.splitMerge.address);

        res = await this.splitMerge.geohashToPackage.call(geohashTokenId);
        assert.equal(res.toString(10), packageId);
      });

      geohashesTokenIds.push(this.firstGeohashTokenId);
      // console.log('removeGeohashesFromPackage', packageId, geohashesTokenIds, directions, directions);
      await this.splitMerge.removeGeohashesFromPackage(packageId, geohashesTokenIds, directions, directions, {
        from: alice
      });

      res = await this.splitMerge.getPackageGeohashesCount.call(packageId);
      assert.equal(res.toString(10), (0).toString(10));

      res = await this.spaceToken.ownerOf.call(packageId);
      assert.equal(res, this.splitMerge.address);
    });

    it('should split and merge correctly', async function() {
      const contourToSplitForOldPackage = ['rweqrweqrweq', 'dssfdssfdssf', 'cxzcxzcxz'].map(galt.geohashToGeohash5);
      const contourToSplitForNewPackage = ['sdsd', 'dfgdfg', 'vbnvbn'].map(galt.geohashToGeohash5);
      let res;
      res = await this.spaceToken.mintGeohash(alice, this.firstGeohash, { from: coreTeam });

      res = await this.splitMerge.initPackage(this.firstGeohashTokenId, { from: alice });

      const packageId = new BN(res.logs[0].args.id.replace('0x', ''), 'hex').toString(10);

      await this.splitMerge.setPackageContour(packageId, this.contour, { from: alice });

      res = await this.splitMerge.splitPackage(packageId, contourToSplitForOldPackage, contourToSplitForNewPackage, {
        from: alice
      });

      const newPackageId = new BN(res.logs[0].args.id.replace('0x', ''), 'hex').toString(10);

      res = await this.spaceToken.ownerOf.call(packageId);
      assert.equal(res, alice);

      res = await this.splitMerge.getPackageContour.call(packageId);
      assert.deepEqual(res.map(item => item.toString(10)), contourToSplitForOldPackage);

      res = await this.spaceToken.ownerOf.call(newPackageId);
      assert.equal(res, alice);

      res = await this.splitMerge.getPackageContour.call(newPackageId);
      assert.deepEqual(res.map(item => item.toString(10)), contourToSplitForNewPackage);

      await this.splitMerge.mergePackage(newPackageId, newPackageId, this.contour, {
        from: alice
      });

      res = await this.splitMerge.getPackageContour.call(newPackageId);
      assert.deepEqual(res.map(item => item.toString(10)), this.contour);

      res = await this.spaceToken.exists.call(newPackageId);
      assert.equal(res, false);
    });
  });

  describe('geohash', () => {
    it('should split and merge correctly', async function() {
      let res = await this.spaceToken.mintGeohash(alice, this.firstGeohash, { from: coreTeam });

      res = await this.spaceToken.ownerOf.call(this.firstGeohashTokenId);
      assert.equal(res, alice);

      res = await this.splitMerge.splitGeohash(this.firstGeohashTokenId, { from: alice });

      res = await this.spaceToken.ownerOf.call(this.firstGeohashTokenId);
      assert.equal(res, this.splitMerge.address);

      const childGeohashTokenId = galt.geohashToTokenId(`${this.initFirstGeohash}0`);
      res = await this.spaceToken.ownerOf.call(childGeohashTokenId);
      assert.equal(res, alice);

      res = await this.spaceToken.balanceOf.call(alice);
      assert.equal(res, '32');

      await this.splitMerge.mergeGeohash(this.firstGeohashTokenId, { from: alice });

      res = await this.spaceToken.ownerOf.call(this.firstGeohashTokenId);
      assert.equal(res, alice);

      res = await this.spaceToken.ownerOf.call(childGeohashTokenId);
      assert.equal(res, this.splitMerge.address);

      res = await this.spaceToken.balanceOf.call(alice);
      assert.equal(res, '1');
    });

    it('should creating correctly by operator', async function() {
      let res;
      // TODO: remove console.log lines when the tests work
      // console.log('spaceToken.mintGeohash', alice, this.firstGeohash);
      res = await this.spaceToken.mintGeohash(alice, this.firstGeohash, { from: coreTeam });

      await this.spaceToken.approve(bob, this.firstGeohashTokenId, { from: alice });

      res = await this.spaceToken.getApproved(this.firstGeohashTokenId);
      assert.equal(res, bob);

      res = await this.splitMerge.initPackage(this.firstGeohashTokenId, { from: bob });

      const packageId = new BN(res.logs[0].args.id.replace('0x', ''), 'hex').toString(10);
      // console.log('packageId', packageId);

      res = await this.spaceToken.ownerOf.call(packageId);
      assert.equal(res, alice);

      // console.log('setPackageContour', packageId, this.contour);
      await this.spaceToken.approve(bob, packageId, { from: alice });

      await this.splitMerge.setPackageContour(packageId, this.contour, { from: bob });

      const geohashes = this.contour;

      const geohashesTokenIds = [];
      const neighborsTokenIds = [];
      const directions = [];

      await pIteration.forEach(geohashes, async geohash => {
        // console.log('mint', geohash);
        res = await this.spaceToken.mintGeohash(alice, geohash, { from: coreTeam });

        geohashesTokenIds.push(galt.geohash5ToTokenId(geohash));
        neighborsTokenIds.push(galt.geohash5ToTokenId(geohash));
        directions.push(web3.utils.asciiToHex('N'));
      });

      await this.spaceToken.setApprovalForAll(bob, true, { from: alice });

      console.log('addGeohashesToPackage', packageId, geohashesTokenIds, neighborsTokenIds, directions);
      await this.splitMerge.addGeohashesToPackage(packageId, geohashesTokenIds, neighborsTokenIds, directions, {
        from: bob
      });

      res = await this.splitMerge.getPackageGeohashesCount.call(packageId);
      assert.equal(res.toString(10), (geohashesTokenIds.length + 1).toString(10));

      res = await this.spaceToken.ownerOf.call(packageId);
      assert.equal(res, alice);

      await pIteration.forEach(geohashesTokenIds, async geohashTokenId => {
        res = await this.spaceToken.ownerOf.call(geohashTokenId);
        assert.equal(res, this.splitMerge.address);

        res = await this.splitMerge.geohashToPackage.call(geohashTokenId);
        assert.equal(res.toString(10), packageId);
      });

      geohashesTokenIds.push(this.firstGeohashTokenId);
      // console.log('removeGeohashesFromPackage', packageId, geohashesTokenIds, directions, directions);
      await this.splitMerge.removeGeohashesFromPackage(packageId, geohashesTokenIds, directions, directions, {
        from: bob
      });

      res = await this.splitMerge.getPackageGeohashesCount.call(packageId);
      assert.equal(res.toString(10), (0).toString(10));

      res = await this.spaceToken.ownerOf.call(packageId);
      assert.equal(res, this.splitMerge.address);
    });
  });
});
