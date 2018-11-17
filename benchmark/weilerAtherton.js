const PointRedBlackTree = artifacts.require('../contracts/collections/PointRedBlackTree.sol');
const SegmentRedBlackTree = artifacts.require('../contracts/collections/SegmentRedBlackTree.sol');
const LandUtils = artifacts.require('../contracts/utils/LandUtils.sol');
const PolygonUtils = artifacts.require('../contracts/utils/PolygonUtils.sol');
const BentleyOttman = artifacts.require('../contracts/utils/BentleyOttman.sol');
const WeilerAtherton = artifacts.require('../contracts/utils/WeilerAtherton.sol');
const MockWeilerAtherton = artifacts.require('../contracts/mocks/MockWeilerAtherton.sol');

const pIteration = require('p-iteration');
const Web3 = require('web3');

const web3 = new Web3(MockWeilerAtherton.web3.currentProvider);

const { initHelperWeb3, ether } = require('../test/helpers');

initHelperWeb3(web3);

module.exports = async function(callback) {
  const accounts = await web3.eth.getAccounts();
  const coreTeam = accounts[0];
  const landUtils = await LandUtils.new({ from: coreTeam });
  PolygonUtils.link('LandUtils', landUtils.address);
  const polygonUtils = await PolygonUtils.new({ from: coreTeam });

  const pointRedBlackTree = await PointRedBlackTree.new({ from: coreTeam });
  BentleyOttman.link('PointRedBlackTree', pointRedBlackTree.address);

  const segmentRedBlackTree = await SegmentRedBlackTree.new({ from: coreTeam });
  BentleyOttman.link('SegmentRedBlackTree', segmentRedBlackTree.address);

  const bentleyOttman = await BentleyOttman.new({ from: coreTeam });

  WeilerAtherton.link('BentleyOttman', bentleyOttman.address);
  WeilerAtherton.link('PolygonUtils', polygonUtils.address);

  const weilerAtherton = await WeilerAtherton.new({ from: coreTeam });
  MockWeilerAtherton.link('WeilerAtherton', weilerAtherton.address);
  MockWeilerAtherton.link('PolygonUtils', polygonUtils.address);

  let mockWeilerAtherton = await MockWeilerAtherton.new({ from: coreTeam });
  let mockWeilerAthertonWeb3 = new web3.eth.Contract(mockWeilerAtherton.abi, mockWeilerAtherton.address);

  await setBasePolygon([
    [1.2291728239506483, 104.51007032766938],
    [1.2037726398557425, 104.50989866629243],
    [1.2036009784787893, 104.53199403360486],
    [1.227113390341401, 104.53336732462049]
  ]);

  await setCropPolygon([
    [1.2314039189368486, 104.52323930338025],
    [1.2152714375406504, 104.52255265787244],
    [1.2126970198005438, 104.54298002645373],
    [1.2344931531697512, 104.54898850992322]
  ]);

  await executeWeilerAtherton();

  await redeploy();

  callback();

  // Helpers
  async function setBasePolygon(points) {
    const etherPoints = points.map(point => point.map(c => ether(Math.round(c * 10 ** 12) / 10 ** 12)));
    await pIteration.forEachSeries(etherPoints, async point => {
      await mockWeilerAtherton.addPointToBasePolygon(point);
    });
  }

  async function setCropPolygon(points) {
    const etherPoints = points.map(point => point.map(c => ether(Math.round(c * 10 ** 12) / 10 ** 12)));
    await pIteration.forEachSeries(etherPoints, async point => {
      await mockWeilerAtherton.addPointToCropPolygon(point);
    });
  }

  async function executeWeilerAtherton() {
    let totalGasUsed = 0;
    let res = await mockWeilerAtherton.initBasePolygon();
    console.log('      initBasePolygon gasUsed', res.receipt.gasUsed);
    totalGasUsed += res.receipt.gasUsed;

    res = await mockWeilerAtherton.initCropPolygon();
    console.log('      initCropPolygon gasUsed', res.receipt.gasUsed);
    totalGasUsed += res.receipt.gasUsed;

    res = await mockWeilerAtherton.addBasePolygonSegments();
    console.log('      addBasePolygonSegments gasUsed', res.receipt.gasUsed);
    totalGasUsed += res.receipt.gasUsed;

    res = await mockWeilerAtherton.addCropPolygonSegments();
    console.log('      addCropPolygonSegments gasUsed', res.receipt.gasUsed);
    totalGasUsed += res.receipt.gasUsed;

    totalGasUsed += await processBentleyOttman();

    res = await mockWeilerAtherton.addIntersectedPoints();
    console.log('      addIntersectedPoints gasUsed', res.receipt.gasUsed);
    totalGasUsed += res.receipt.gasUsed;
    res = await mockWeilerAtherton.buildResultPolygon();
    console.log('      buildResultPolygon gasUsed', res.receipt.gasUsed);
    totalGasUsed += res.receipt.gasUsed;
    res = await mockWeilerAtherton.buildBasePolygonOutput();
    console.log('      buildBasePolygonOutput gasUsed', res.receipt.gasUsed);
    totalGasUsed += res.receipt.gasUsed;
    console.log('');
    console.log('      totalGasUsed', totalGasUsed);
  }

  async function processBentleyOttman() {
    const isOver = await mockWeilerAthertonWeb3.methods.isBentleyOttmanFinished().call();
    if (isOver) {
      return 0;
    }
    const res = await mockWeilerAtherton.processBentleyOttman();
    console.log('      processBentleyOttman tx gasUsed', res.receipt.gasUsed);

    return res.receipt.gasUsed + (await processBentleyOttman());
  }

  async function redeploy() {
    mockWeilerAtherton = await MockWeilerAtherton.new({ from: coreTeam });
    mockWeilerAthertonWeb3 = new web3.eth.Contract(mockWeilerAtherton.abi, mockWeilerAtherton.address);
  }

  // Helpers end
};
