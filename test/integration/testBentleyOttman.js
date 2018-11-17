const PointRedBlackTree = artifacts.require('./collections/PointRedBlackTree.sol');
const SegmentRedBlackTree = artifacts.require('./collections/SegmentRedBlackTree.sol');
const BentleyOttman = artifacts.require('./utils/BentleyOttman.sol');
const MockBentleyOttman = artifacts.require('./mocks/MockBentleyOttman.sol');

const Web3 = require('web3');
const chai = require('chai');
const pIteration = require('p-iteration');
const chaiAsPromised = require('chai-as-promised');
const chaiBigNumber = require('chai-bignumber')(Web3.utils.BN);
const { initHelperWeb3, ether } = require('../helpers');

const web3 = new Web3(MockBentleyOttman.web3.currentProvider);

initHelperWeb3(web3);

// TODO: move to helpers
Web3.utils.BN.prototype.equal = Web3.utils.BN.prototype.eq;
Web3.utils.BN.prototype.equals = Web3.utils.BN.prototype.eq;

chai.use(chaiAsPromised);
chai.use(chaiBigNumber);
chai.should();

contract('BentleyOttman', ([coreTeam]) => {
  beforeEach(async function() {
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
        return;
      }
      await this.mockBentleyOttman.handleQueuePoints();

      await this.handleQueuePoints();
    };

    this.setSegmentsAndHandleQueuePoints = async function(segments) {
      const etherSegments = segments.map(segment =>
        segment.map(point => point.map(c => ether(Math.round(c * 10 ** 12) / 10 ** 12)))
      );

      await pIteration.forEachSeries(etherSegments, async segment => {
        await this.mockBentleyOttman.addSegment(segment);
      });

      await this.handleQueuePoints();
    };
  });

  describe('#handleQueuePoints()', () => {
    it('should correctly handleQueuePoints case 1', async function() {
      await this.setSegmentsAndHandleQueuePoints([
        [[37.484750007973105, 55.752246954910646], [37.58202906030469, 55.77921141925473]],
        [[37.61120188739855, 55.73959974028182], [37.797988512759424, 55.747811024975036]],
        [[37.74709936516053, 55.7495343170777], [37.53610865112482, 55.71211068549921]],
        [[37.625201497695514, 55.71944373035385], [37.7595083872098, 55.747766806262256]],
        [[37.68599959332016, 55.782359403768204], [37.49501443612691, 55.72772231919566]]
      ]);

      const outputLength = await this.mockBentleyOttmanWeb3.methods.getOutputLength().call();
      assert.equal(outputLength, '2');

      const outputPoint1 = await this.mockBentleyOttmanWeb3.methods.getOutputPoint(0).call();
      assert.deepEqual(outputPoint1.map(c => c.toString(10)), ['37717413344078919255', '55744268878164737395']);

      const outputPoint2 = await this.mockBentleyOttmanWeb3.methods.getOutputPoint(1).call();
      assert.deepEqual(outputPoint2.map(c => c.toString(10)), ['37749639151743334230', '55745685549624400907']);
    });

    it('should correctly handleQueuePoints case 2', async function() {
      await this.setSegmentsAndHandleQueuePoints([
        [[37.76969192083046, 55.76677008516301], [37.63181731019415, 55.751938326388974]],
        [[37.441016373071996, 55.78557135451422], [37.608522492722216, 55.73105542625078]],
        [[37.652041463641424, 55.73987541904628], [37.68218877423553, 55.76885334957768]],
        [[37.68831757976256, 55.75111211248927], [37.679768066345304, 55.76043505829761]],
        [[37.63480194752325, 55.723303783416455], [37.5096053342284, 55.729045212762685]],
        [[37.566044579959325, 55.7377918616373], [37.516416549790414, 55.79247372710407]],
        [[37.53609668783335, 55.74886598399479], [37.53457057953605, 55.71145403212967]],
        [[37.60169673277886, 55.74330451873227], [37.67315110221475, 55.721233976712554]]
      ]);

      const outputLength = await this.mockBentleyOttmanWeb3.methods.getOutputLength().call();

      assert.equal(outputLength, '4');

      const outputPoint1 = await this.mockBentleyOttmanWeb3.methods.getOutputPoint(0).call();
      assert.deepEqual(outputPoint1.map(c => c.toString(10)), ['37556914657470942910', '55747851523314402727']);

      const outputPoint2 = await this.mockBentleyOttmanWeb3.methods.getOutputPoint(1).call();
      assert.deepEqual(outputPoint2.map(c => c.toString(10)), ['37535240203994515438', '55727869615518710383']);

      const outputPoint3 = await this.mockBentleyOttmanWeb3.methods.getOutputPoint(2).call();
      assert.deepEqual(outputPoint3.map(c => c.toString(10)), ['37668721279193154269', '55755908243427922272']);

      const outputPoint4 = await this.mockBentleyOttmanWeb3.methods.getOutputPoint(3).call();
      assert.deepEqual(outputPoint4.map(c => c.toString(10)), ['37682554673476539477', '55757396360537304177']);
    });

    it('should correctly handleQueuePoints case 3', async function() {
      await this.setSegmentsAndHandleQueuePoints([
        [[1.2036009784787893, 104.53199403360486], [1.227113390341401, 104.53336732462049]],
        [[1.227113390341401, 104.53336732462049], [1.2291728239506483, 104.51007032766938]],
        [[1.2314039189368486, 104.52323930338025], [1.2152714375406504, 104.52255265787244]],
        [[1.2152714375406504, 104.52255265787244], [1.2126970198005438, 104.54298002645373]]
      ]);

      const outputLength = await this.mockBentleyOttmanWeb3.methods.getOutputLength().call();

      assert.equal(outputLength, '4');

      let outputPoint = await this.mockBentleyOttmanWeb3.methods.getOutputPoint(0).call();
      assert.deepEqual(outputPoint.map(c => c.toString(10)), ['1214004978082921703', '104532601700706953950']);

      outputPoint = await this.mockBentleyOttmanWeb3.methods.getOutputPoint(1).call();
      assert.deepEqual(outputPoint.map(c => c.toString(10)), ['1215271437541000000', '104522552657872000000']);

      outputPoint = await this.mockBentleyOttmanWeb3.methods.getOutputPoint(2).call();
      assert.deepEqual(outputPoint.map(c => c.toString(10)), ['1227113390341000000', '104533367324620000000']);

      outputPoint = await this.mockBentleyOttmanWeb3.methods.getOutputPoint(3).call();
      assert.deepEqual(outputPoint.map(c => c.toString(10)), ['1228021425037785016', '104523095334564247375']);
    });

    it('should correctly handleQueuePoints case 4', async function() {
      await this.setSegmentsAndHandleQueuePoints([
        [[1.2291728239506483, 104.51007032766938], [1.2037726398557425, 104.50989866629243]],
        [[1.2037726398557425, 104.50989866629243], [1.2036009784787893, 104.53199403360486]],
        [[1.2036009784787893, 104.53199403360486], [1.227113390341401, 104.53336732462049]],
        [[1.227113390341401, 104.53336732462049], [1.2291728239506483, 104.51007032766938]],
        [[1.2314039189368486, 104.52323930338025], [1.2152714375406504, 104.52255265787244]],
        [[1.2152714375406504, 104.52255265787244], [1.2126970198005438, 104.54298002645373]],
        [[1.2126970198005438, 104.54298002645373], [1.2344931531697512, 104.54898850992322]],
        [[1.2344931531697512, 104.54898850992322], [1.2314039189368486, 104.52323930338025]]
      ]);

      const outputLength = await this.mockBentleyOttmanWeb3.methods.getOutputLength().call();

      assert.equal(outputLength, '10');

      let outputPoint = await this.mockBentleyOttmanWeb3.methods.getOutputPoint(0).call();
      assert.deepEqual(outputPoint.map(c => c.toString(10)), ['1203600978479000000', '104531994033605000000']);

      outputPoint = await this.mockBentleyOttmanWeb3.methods.getOutputPoint(1).call();
      assert.deepEqual(outputPoint.map(c => c.toString(10)), ['1203772639856000000', '104509898666292000000']);

      outputPoint = await this.mockBentleyOttmanWeb3.methods.getOutputPoint(2).call();
      assert.deepEqual(outputPoint.map(c => c.toString(10)), ['1212697019801000000', '104542980026454000000']);

      outputPoint = await this.mockBentleyOttmanWeb3.methods.getOutputPoint(3).call();
      assert.deepEqual(outputPoint.map(c => c.toString(10)), ['1214004978082921703', '104532601700706953950']);

      outputPoint = await this.mockBentleyOttmanWeb3.methods.getOutputPoint(4).call();
      assert.deepEqual(outputPoint.map(c => c.toString(10)), ['1215271437541000000', '104522552657872000000']);

      outputPoint = await this.mockBentleyOttmanWeb3.methods.getOutputPoint(5).call();
      assert.deepEqual(outputPoint.map(c => c.toString(10)), ['1227113390341000000', '104533367324620000000']);

      outputPoint = await this.mockBentleyOttmanWeb3.methods.getOutputPoint(6).call();
      assert.deepEqual(outputPoint.map(c => c.toString(10)), ['1228021425037785016', '104523095334564247375']);

      outputPoint = await this.mockBentleyOttmanWeb3.methods.getOutputPoint(7).call();
      assert.deepEqual(outputPoint.map(c => c.toString(10)), ['1229172823951000000', '104510070327669000000']);

      outputPoint = await this.mockBentleyOttmanWeb3.methods.getOutputPoint(8).call();
      assert.deepEqual(outputPoint.map(c => c.toString(10)), ['1231403918937000000', '104523239303380000000']);

      outputPoint = await this.mockBentleyOttmanWeb3.methods.getOutputPoint(9).call();
      assert.deepEqual(outputPoint.map(c => c.toString(10)), ['1234493153170000000', '104548988509923000000']);
    });
  });
});
