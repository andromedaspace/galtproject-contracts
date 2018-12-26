const MultiSigFactory = artifacts.require('./MultiSigFactory.sol');
const ArbitratorsMultiSigFactory = artifacts.require('./ArbitratorsMultiSigFactory.sol');
const ArbitratorVotingFactory = artifacts.require('./ArbitratorVotingFactory.sol');
const OracleStakesAccountingFactory = artifacts.require('./OracleStakesAccountingFactory.sol');

const Helpers = {
  async deployMultiSigFactory(
    galtTokenAddress,
    oraclesContract,
    claimManagerAddress,
    multiSigRegistryContract,
    spaceReputationAccountingAddress,
    owner
  ) {
    const multiSig = await ArbitratorsMultiSigFactory.new({ from: owner });
    const voting = await ArbitratorVotingFactory.new({ from: owner });
    const oracleStakes = await OracleStakesAccountingFactory.new({ from: owner });

    const multiSigFactory = await MultiSigFactory.new(
      multiSigRegistryContract.address,
      galtTokenAddress,
      oraclesContract.address,
      claimManagerAddress,
      spaceReputationAccountingAddress,
      multiSig.address,
      voting.address,
      oracleStakes.address,
      { from: owner }
    );

    await multiSigRegistryContract.addRoleTo(multiSigFactory.address, await multiSigRegistryContract.ROLE_FACTORY(), {
      from: owner
    });
    await oraclesContract.addRoleTo(
      multiSigFactory.address,
      await oraclesContract.ROLE_ORACLE_STAKES_NOTIFIER_MANAGER(),
      {
        from: owner
      }
    );

    return multiSigFactory;
  }
};

module.exports = Helpers;
