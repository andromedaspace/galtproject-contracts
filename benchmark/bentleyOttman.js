const PointRedBlackTree = artifacts.require('../contracts/collections/PointRedBlackTree.sol');
const SegmentRedBlackTree = artifacts.require('./collections/SegmentRedBlackTree.sol');
const BentleyOttman = artifacts.require('./utils/BentleyOttman.sol');
const MockBentleyOttman = artifacts.require('./mocks/MockBentleyOttman.sol');

const pIteration = require('p-iteration');
const Web3 = require('web3');

const web3 = new Web3(MockBentleyOttman.web3.currentProvider);

const { initHelperWeb3, ether } = require('../test/helpers');

initHelperWeb3(web3);

module.exports = async function(callback) {
  const accounts = await web3.eth.getAccounts();
  const coreTeam = accounts[0];

  this.pointRedBlackTree = await PointRedBlackTree.new({ from: coreTeam });
  BentleyOttman.link('PointRedBlackTree', this.pointRedBlackTree.address);

  this.segmentRedBlackTree = await SegmentRedBlackTree.new({ from: coreTeam });
  BentleyOttman.link('SegmentRedBlackTree', this.segmentRedBlackTree.address);

  this.bentleyOttman = await BentleyOttman.new({ from: coreTeam });
  MockBentleyOttman.link('BentleyOttman', this.bentleyOttman.address);

  this.mockBentleyOttman = await MockBentleyOttman.new({ from: coreTeam });

  this.mockBentleyOttmanWeb3 = new web3.eth.Contract(this.mockBentleyOttman.abi, this.mockBentleyOttman.address);

  this.handleQueuePoints = async function() {
    const isOver = await this.mockBentleyOttmanWeb3.methods.isQueuePointsOver().call();
    if (isOver) {
      return 0;
    }
    const res = await this.mockBentleyOttman.handleQueuePoints();
    console.log('      handleQueuePoints tx gasUsed', res.receipt.gasUsed);

    return res.receipt.gasUsed + (await this.handleQueuePoints());
  };
  this.setSegmentsAndHandleQueuePoints = async function(segments) {
    console.log(`      Segments count: ${segments.length}\n`);
    const etherSegments = segments.map(segment =>
      segment.map(point => point.map(c => ether(Math.round(c * 10 ** 12) / 10 ** 12)))
    );

    let totalAddSegmentGasUsed = 0;
    await pIteration.forEachSeries(etherSegments, async segment => {
      const res = await this.mockBentleyOttman.addSegment(segment);
      console.log('      addSegment tx gasUsed', res.receipt.gasUsed);
      totalAddSegmentGasUsed += res.receipt.gasUsed;
    });

    const handleQueueTotalGasUsed = await this.handleQueuePoints();
    console.log('');
    console.log('      addSegment total gasUsed', totalAddSegmentGasUsed);
    console.log('      handleQueuePoints total gasUsed', handleQueueTotalGasUsed);
  };

  await this.setSegmentsAndHandleQueuePoints([
    [[37.484750007973105, 55.752246954910646], [37.58202906030469, 55.77921141925473]],
    [[37.61120188739855, 55.73959974028182], [37.797988512759424, 55.747811024975036]],
    [[37.74709936516053, 55.7495343170777], [37.53610865112482, 55.71211068549921]],
    [[37.625201497695514, 55.71944373035385], [37.7595083872098, 55.747766806262256]],
    [[37.68599959332016, 55.782359403768204], [37.49501443612691, 55.72772231919566]]
  ]);

  callback();
};
