const GaltToken = artifacts.require('./GaltToken.sol');
const Web3 = require('web3');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const chaiBigNumber = require('chai-bignumber')(Web3.utils.BN);
const { initHelperWeb3, ether, assertRevert } = require('../helpers');

const web3 = new Web3(GaltToken.web3.currentProvider);

// TODO: move to helpers
Web3.utils.BN.prototype.equal = Web3.utils.BN.prototype.eq;
Web3.utils.BN.prototype.equals = Web3.utils.BN.prototype.eq;
initHelperWeb3(web3);

chai.use(chaiAsPromised);
chai.use(chaiBigNumber);
chai.should();

contract.only('GaltToken', ([deployer, alice, bob]) => {
  beforeEach(async function() {
    this.galtTokenTruffle = await GaltToken.new({ from: deployer });
    this.galtToken = new web3.eth.Contract(this.galtTokenTruffle.abi, this.galtTokenTruffle.address);
  });

  describe('#mint()', () => {
    it('should allow deployer mint some tokens', async function() {
      await this.galtToken.methods.mint(alice, ether(42)).send({ from: deployer });
      const res = await this.galtToken.methods.balanceOf(alice).call();
      res.should.be.a.bignumber.eq(ether(42));
    });

    it('should deny non-owner mint operation', async function() {
      await assertRevert(this.galtToken.methods.mint(alice, ether(42)).send({ from: bob }));
      const res = await this.galtToken.methods.balanceOf(alice).call();
      res.should.be.a.bignumber.eq(0);
    });
  });
});
