const MockPointRedBlackTree = artifacts.require('./mocks/MockPointRedBlackTree.sol');

const pIteration = require('p-iteration');
const Web3 = require('web3');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const chaiBigNumber = require('chai-bignumber')(Web3.utils.BN);
const {
  initHelperWeb3,
  initHelperArtifacts,
  ether,
  getPointRedBlackTreeLib,
  getPolygonUtilsLib,
  clearLibCache
} = require('../helpers');

const web3 = new Web3(MockPointRedBlackTree.web3.currentProvider);

initHelperWeb3(web3);
initHelperArtifacts(artifacts);

// TODO: move to helpers
Web3.utils.BN.prototype.equal = Web3.utils.BN.prototype.eq;
Web3.utils.BN.prototype.equals = Web3.utils.BN.prototype.eq;

chai.use(chaiAsPromised);
chai.use(chaiBigNumber);
chai.should();

const EPS = 1e-9;
function comparePoints(a, b) {
  const x1 = a[0];
  const y1 = a[1];
  const x2 = b[0];
  const y2 = b[1];

  if (x1 - x2 > EPS || (Math.abs(x1 - x2) < EPS && y1 - y2 > EPS)) {
    return 1;
  }
  if (x2 - x1 > EPS || (Math.abs(x1 - x2) < EPS && y2 - y1 > EPS)) {
    return -1;
  }
  if (Math.abs(x1 - x2) < EPS && Math.abs(y1 - y2) < EPS) {
    return 0;
  }
  return null;
}

contract('PointRedBlackTree', ([coreTeam]) => {
  before(clearLibCache);
  beforeEach(async function() {
    this.pointUtils = await getPolygonUtilsLib();
    this.pointRedBlackTree = await getPointRedBlackTreeLib();
    MockPointRedBlackTree.link('PointRedBlackTree', this.pointRedBlackTree.address);
    MockPointRedBlackTree.link('PointUtils', this.pointUtils.address);

    this.mockPointRedBlackTree = await MockPointRedBlackTree.new({ from: coreTeam });

    this.mockPointRedBlackTreeWeb3 = new web3.eth.Contract(
      this.mockPointRedBlackTree.abi,
      this.mockPointRedBlackTree.address
    );

    this.points = [
      [200, 12],
      [612, 401],
      [375, 486],
      [581, 21],
      [680, 25],
      [106, 414],
      [135, 478],
      [333, 51],
      [120, 74],
      [590, 473]
    ];

    this.etherPoints = this.points.map(point => point.map(coor => ether(coor)));
  });

  describe('#comparePoints()', () => {
    it('should correctly detect comparePoints', async function() {
      // Helpers
      this.comparePoints = async function(point1, point2, expectedResult) {
        // console.log('      comparePoints', point1, point2);
        const res = await this.mockPointRedBlackTree.comparePoints(
          point1.map(c => ether(c)),
          point2.map(c => ether(c)),
          {
            from: coreTeam
          }
        );
        assert.deepEqual(res.logs[0].args.result.toString(10), expectedResult.toString(10));
      };
      // Helpers end

      await this.comparePoints([10, 0], [0, 0], 1);
      await this.comparePoints([2, -1], [0, 0], 1);
      await this.comparePoints([2, -1], [10, 0], -1);
      await this.comparePoints([5, 5], [2, -1], 1);
      await this.comparePoints([5, 5], [10, 0], -1);
      await this.comparePoints([5, 0], [2, -1], 1);
      await this.comparePoints([5, 0], [10, 0], -1);
      await this.comparePoints([5, 0], [5, 5], -1);
      await this.comparePoints([5, 10], [2, -1], 1);
      await this.comparePoints([5, 10], [5, 5], 1);
      await this.comparePoints([5, 10], [10, 0], -1);
      await this.comparePoints([1, 1], [5, 5], -1);
      await this.comparePoints([1, 1], [2, -1], -1);
      await this.comparePoints([1, 1], [0, 0], 1);
      await this.comparePoints([3, 7], [5, 5], -1);
      await this.comparePoints([3, 7], [2, -1], 1);
      await this.comparePoints([3, 7], [5, 0], -1);
    });
  });

  describe('#insert() and find()', () => {
    it('should correctly insert and find points', async function() {
      // Helpers
      this.getPointId = function(point) {
        return `1${Math.abs(web3.utils.fromWei(point[0], 'ether')).toString()}1${Math.abs(
          web3.utils.fromWei(point[1], 'ether')
        ).toString()}`;
      };

      this.insert = async function(point) {
        // console.log('      PointRedBlackTree.insert()', point);
        const id = this.getPointId(point);
        await this.mockPointRedBlackTree.insert(id, point, {
          from: coreTeam
        });
      };

      this.find = async function(point) {
        // console.log('      PointRedBlackTree.find()', point);
        const expectedId = this.getPointId(point);
        const res = await this.mockPointRedBlackTree.find(point, {
          from: coreTeam
        });
        const itemId = res.logs[0].args.id.toString(10);
        assert.equal(expectedId.toString(10), itemId.toString(10));
      };

      this.checkRightAndLeft = async function(item) {
        if (parseInt(item.left, 10)) {
          const leftItem = await this.mockPointRedBlackTreeWeb3.methods.getItem(item.left).call();
          assert.equal(comparePoints(item.value, leftItem.value), 1);
          await this.checkRightAndLeft(leftItem);
        }
        if (parseInt(item.right, 10)) {
          const rightItem = await this.mockPointRedBlackTreeWeb3.methods.getItem(item.right).call();
          assert.equal(comparePoints(item.value, rightItem.value), -1);
          await this.checkRightAndLeft(rightItem);
        }
      };
      // Helpers end

      await pIteration.forEachSeries(this.etherPoints, async point => {
        await this.insert(point);
      });

      await pIteration.forEachSeries(this.etherPoints, async point => {
        await this.find(point);
      });

      const resultRootId = await this.mockPointRedBlackTreeWeb3.methods.getRoot().call();
      const resultRootItem = await this.mockPointRedBlackTreeWeb3.methods.getItem(resultRootId).call();

      await this.checkRightAndLeft(resultRootItem);
    });
  });
});
