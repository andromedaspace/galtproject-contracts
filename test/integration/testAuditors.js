const Auditors = artifacts.require('./Auditors.sol');
const Web3 = require('web3');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { assertRevert, initHelperWeb3 } = require('../helpers');

const { hexToUtf8 } = Web3.utils;
const web3 = new Web3(Auditors.web3.currentProvider);

initHelperWeb3(web3);

chai.use(chaiAsPromised);

// NOTICE: we don't wrap MockToken with a proxy on production
contract.only('Auditors', ([coreTeam, auditorManager, alice, bob, charlie]) => {
  beforeEach(async function() {
    this.auditors = await Auditors.new(coreTeam, { from: coreTeam });

    await this.auditors.addRoleTo(coreTeam, await this.auditors.ROLE_MANAGER(), {
      from: coreTeam
    });
    await this.auditors.addRoleTo(auditorManager, await this.auditors.ROLE_AUDITOR_MANAGER(), {
      from: coreTeam
    });
    this.auditorsWeb3 = new web3.eth.Contract(this.auditors.abi, this.auditors.address);
  });

  it('should have an empty auditors list by default', async function() {
    const res = await this.auditorsWeb3.methods.getAuditors().call();
    assert.equal(res.length, 0);
  });

  it('should have 0 size by default', async function() {
    const res = await this.auditorsWeb3.methods.getSize().call();
    assert.equal(res, 0);
  });

  describe('#addAuditor()', () => {
    it('should add multiple auditors to an empty list', async function() {
      await this.auditors.addAuditor(alice, 320, { from: auditorManager });
      await this.auditors.addAuditor(bob, 280, { from: auditorManager });
      await this.auditors.addAuditor(charlie, 560, { from: auditorManager });

      let res = await this.auditorsWeb3.methods.getAuditors().call();
      assert.sameMembers(res.map(a => a.toLowerCase()), [alice, bob, charlie]);

      res = await this.auditorsWeb3.methods.auditorWeight(alice).call();
      assert.equal(res, 320);
      res = await this.auditorsWeb3.methods.auditorWeight(bob).call();
      assert.equal(res, 280);
      res = await this.auditorsWeb3.methods.auditorWeight(charlie).call();
      assert.equal(res, 560);

      res = await this.auditorsWeb3.methods.getSize().call();
      assert.equal(res, 3);
    });

    it('should deny adding the same auditor twice', async function() {
      await this.auditors.addAuditor(alice, 320, { from: auditorManager });
      await assertRevert(this.auditors.addAuditor(alice, 310, { from: auditorManager }));

      const res = await this.auditorsWeb3.methods.getAuditors().call();
      assert.sameMembers(res.map(a => a.toLowerCase()), [alice]);
    });
  });

  describe('#removeAuditor()', () => {
    beforeEach(async function() {
      await this.auditors.addAuditor(alice, 320, { from: auditorManager });
      await this.auditors.addAuditor(bob, 280, { from: auditorManager });
      await this.auditors.addAuditor(charlie, 560, { from: auditorManager });
    });

    it('should allow removing auditor', async function() {
      await this.auditors.removeAuditor(bob, { from: auditorManager });

      let res = await this.auditorsWeb3.methods.getAuditors().call();
      assert.sameMembers(res.map(a => a.toLowerCase()), [alice, charlie]);

      res = await this.auditorsWeb3.methods.getSize().call();
      assert.equal(res, 2);

      res = await this.auditorsWeb3.methods.auditorWeight(bob).call();
      assert.equal(res, 0);
    });

    it('should deny removing the same auditor twice', async function() {
      await this.auditors.removeAuditor(bob, { from: auditorManager });
      await assertRevert(this.auditors.removeAuditor(bob, { from: auditorManager }));
    });
  });
});
