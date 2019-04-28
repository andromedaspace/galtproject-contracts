const MultiSigFactory = artifacts.require('./MultiSigFactory.sol');
const ArbitratorsMultiSigFactory = artifacts.require('./ArbitratorsMultiSigFactory.sol');
const ArbitrationCandidateTopFactory = artifacts.require('./ArbitrationCandidateTopFactory.sol');
const ArbitratorStakeAccountingFactory = artifacts.require('./ArbitratorStakeAccountingFactory.sol');
const OracleStakesAccountingFactory = artifacts.require('./OracleStakesAccountingFactory.sol');
const ArbitrationConfigFactory = artifacts.require('./ArbitrationConfigFactory.sol');
const ArbitrationOracleFactory = artifacts.require('./ArbitrationOracleFactory.sol');
const DelegateReputationVotingFactory = artifacts.require('./DelegateReputationVotingFactory.sol');
const OracleStakeVotingFactory = artifacts.require('./OracleStakeVotingFactory.sol');

const ArbitrationModifyThresholdProposalFactory = artifacts.require('./ArbitrationModifyThresholdProposalFactory.sol');
const ArbitrationModifyApplicationConfigProposalFactory = artifacts.require(
  './ArbitrationModifyApplicationConfigProposalFactory.sol'
);
const ArbitrationModifyMofNProposalFactory = artifacts.require('./ArbitrationModifyMofNProposalFactory.sol');
const ArbitrationModifyArbitratorStakeProposalFactory = artifacts.require(
  './ArbitrationModifyArbitratorStakeProposalFactory.sol'
);
const ArbitrationModifyContractAddressProposalFactory = artifacts.require(
  './ArbitrationModifyContractAddressProposalFactory.sol'
);
const ArbitrationRevokeArbitratorsProposalFactory = artifacts.require(
  './ArbitrationRevokeArbitratorsProposalFactory.sol'
);
const ArbitrationCreateGlobalProposalProposalManagerFactory = artifacts.require(
  './ArbitrationCreateGlobalProposalProposalManagerFactory.sol'
);
const ArbitrationSupportGlobalProposalProposalManagerFactory = artifacts.require(
  './ArbitrationSupportGlobalProposalProposalManagerFactory.sol'
);

const ArbitratorStakeAccounting = artifacts.require('./ArbitratorStakeAccounting.sol');
const OracleStakesAccounting = artifacts.require('./OracleStakesAccounting.sol');
const ArbitratorsMultiSig = artifacts.require('./ArbitratorsMultiSig.sol');
const ArbitrationCandidateTop = artifacts.require('./ArbitrationCandidateTop.sol');
const ArbitrationConfig = artifacts.require('./ArbitrationConfig.sol');
const ArbitrationOracles = artifacts.require('./ArbitrationOracles.sol');
const DelegateReputationVoting = artifacts.require('./DelegateReputationVoting.sol');
const OracleStakeVoting = artifacts.require('./OracleStakeVoting.sol');
const ModifyThresholdProposalManager = artifacts.require('./ModifyThresholdProposalManager.sol');
const ModifyApplicationConfigProposalManager = artifacts.require('./ModifyApplicationConfigProposalManager.sol');
const ModifyMofNProposalManager = artifacts.require('./ModifyMofNProposalManager.sol');
const ModifyMinimalArbitratrorStakeProposalManager = artifacts.require(
  './ModifyMinimalArbitratorStakeProposalManager.sol'
);
const CreateGlobalProposalProposalManager = artifacts.require('./CreateGlobalProposalProposalManager.sol');
const SupportGlobalProposalProposalManager = artifacts.require('./SupportGlobalProposalProposalManager.sol');
const ModifyContractAddressProposalManager = artifacts.require('./ModifyContractAddressProposalManager.sol');
const RevokeArbitratorsProposalManager = artifacts.require('./RevokeArbitratorsProposalManager.sol');

ArbitrationCandidateTop.numberFormat = 'String';

const Helpers = {
  async deployMultiSigFactory(ggr, owner) {
    const multiSig = await ArbitratorsMultiSigFactory.new({ from: owner });

    const candidateTop = await ArbitrationCandidateTopFactory.new({ from: owner });
    const oracleStakes = await OracleStakesAccountingFactory.new({ from: owner });
    const arbitratorStakes = await ArbitratorStakeAccountingFactory.new({ from: owner });
    const arbitrationConfig = await ArbitrationConfigFactory.new({ from: owner });
    const arbitrationOracleFactory = await ArbitrationOracleFactory.new({ from: owner });
    const delegateReputationVotingFactory = await DelegateReputationVotingFactory.new({ from: owner });
    const oracleStakeVotingFactory = await OracleStakeVotingFactory.new({ from: owner });

    const arbitrationModifyThresholdProposalFactory = await ArbitrationModifyThresholdProposalFactory.new({
      from: owner
    });
    const arbitrationModifyMofNProposalFactory = await ArbitrationModifyMofNProposalFactory.new({ from: owner });
    const arbitrationModifyArbitratorStakeProposalFactory = await ArbitrationModifyArbitratorStakeProposalFactory.new({
      from: owner
    });
    const arbitrationModifyContractAddressProposalFactory = await ArbitrationModifyContractAddressProposalFactory.new({
      from: owner
    });
    const arbitrationRevokeArbitratorsProposalFactory = await ArbitrationRevokeArbitratorsProposalFactory.new({
      from: owner
    });
    // eslint-disable-next-line
    const arbitrationModifyApplicationConfigProposalFactory = await ArbitrationModifyApplicationConfigProposalFactory.new(
      {
        from: owner
      }
    );
    // eslint-disable-next-line
    const arbitrationCreateGlobalProposalProposalManagerFactory = await ArbitrationCreateGlobalProposalProposalManagerFactory.new(
      {
        from: owner
      }
    );
    // eslint-disable-next-line
    const arbitrationSupportGlobalProposalProposalManagerFactory = await ArbitrationSupportGlobalProposalProposalManagerFactory.new(
      {
        from: owner
      }
    );

    const multiSigFactory = await MultiSigFactory.new(
      ggr.address,
      multiSig.address,
      candidateTop.address,
      arbitratorStakes.address,
      oracleStakes.address,
      arbitrationConfig.address,
      arbitrationOracleFactory.address,
      delegateReputationVotingFactory.address,
      oracleStakeVotingFactory.address,
      { from: owner }
    );

    await multiSigFactory.initialize(
      arbitrationModifyThresholdProposalFactory.address,
      arbitrationModifyMofNProposalFactory.address,
      arbitrationModifyArbitratorStakeProposalFactory.address,
      arbitrationModifyContractAddressProposalFactory.address,
      arbitrationRevokeArbitratorsProposalFactory.address,
      arbitrationModifyApplicationConfigProposalFactory.address,
      arbitrationCreateGlobalProposalProposalManagerFactory.address,
      arbitrationSupportGlobalProposalProposalManagerFactory.address
    );

    return multiSigFactory;
  },
  async buildArbitration(
    factory,
    initialOwners,
    initialRequired,
    m,
    n,
    periodLength,
    minimalArbitratorStake,
    thresholds,
    applicationConfigs,
    owner,
    ethValue = 0
  ) {
    let res = await factory.buildFirstStep(initialOwners, initialRequired, m, n, minimalArbitratorStake, thresholds, {
      from: owner,
      value: ethValue
    });
    const multiSig = await ArbitratorsMultiSig.at(res.logs[0].args.arbitratorMultiSig);
    const config = await ArbitrationConfig.at(res.logs[0].args.arbitrationConfig);
    const oracleStakeAccounting = await OracleStakesAccounting.at(res.logs[0].args.oracleStakesAccounting);
    const { groupId } = res.logs[0].args;

    res = await factory.buildSecondStep(groupId, periodLength, { from: owner });
    const candidateTop = await ArbitrationCandidateTop.at(res.logs[0].args.arbitrationCandidateTop);
    const arbitratorStakeAccounting = await ArbitratorStakeAccounting.at(res.logs[0].args.arbitratorStakeAccounting);

    res = await factory.buildThirdStep(groupId, { from: owner });
    const modifyThresholdProposalManager = await ModifyThresholdProposalManager.at(
      res.logs[0].args.modifyThresholdProposalManager
    );
    const modifyMofNProposalManager = await ModifyMofNProposalManager.at(res.logs[0].args.modifyMofNProposalManager);
    const modifyArbitratorStakeProposalManager = await ModifyMinimalArbitratrorStakeProposalManager.at(
      res.logs[0].args.modifyArbitratorStakeProposalManager
    );

    res = await factory.buildFourthStep(groupId, { from: owner });
    const modifyContractAddressProposalManager = await ModifyContractAddressProposalManager.at(
      res.logs[0].args.modifyContractAddressProposalManager
    );
    const revokeArbitratorsProposalManager = await RevokeArbitratorsProposalManager.at(
      res.logs[0].args.revokeArbitratorsProposalManager
    );

    res = await factory.buildFifthStep(groupId, { from: owner });
    const modifyApplicationConfigProposalManager = await ModifyApplicationConfigProposalManager.at(
      res.logs[0].args.modifyApplicationConfigProposalManager
    );

    const keys = Object.keys(applicationConfigs);
    const values = [];

    for (let i = 0; i < keys.length; i++) {
      values[i] = applicationConfigs[keys[i]];
    }

    await factory.buildSixthStep(groupId, keys, values, { from: owner });
    await factory.buildSixthStepDone(groupId, { from: owner });

    res = await factory.buildSeventhStep(groupId, { from: owner });
    const delegateSpaceVoting = await DelegateReputationVoting.at(res.logs[0].args.delegateSpaceVoting);
    const delegateGaltVoting = await DelegateReputationVoting.at(res.logs[0].args.delegateGaltVoting);
    const oracleStakeVoting = await OracleStakeVoting.at(res.logs[0].args.oracleStakeVoting);

    res = await factory.buildEighthStep(groupId, { from: owner });
    const createGlobalProposalProposalManager = await CreateGlobalProposalProposalManager.at(
      res.logs[0].args.createGlobalProposal
    );
    const supportGlobalProposalProposalManager = await SupportGlobalProposalProposalManager.at(
      res.logs[0].args.supportGlobalProposal
    );

    res = await factory.buildNinthStep(groupId, { from: owner });
    const oracles = await ArbitrationOracles.at(res.logs[0].args.oracles);

    return {
      groupId,
      multiSig,
      config,
      candidateTop,
      oracleStakeAccounting,
      arbitratorStakeAccounting,
      modifyThresholdProposalManager,
      modifyMofNProposalManager,
      modifyArbitratorStakeProposalManager,
      modifyContractAddressProposalManager,
      modifyApplicationConfigProposalManager,
      revokeArbitratorsProposalManager,
      createGlobalProposalProposalManager,
      supportGlobalProposalProposalManager,
      delegateSpaceVoting,
      delegateGaltVoting,
      oracleStakeVoting,
      oracles
    };
  }
};

module.exports = Helpers;
