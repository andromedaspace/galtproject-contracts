/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster),
 * [Valery Litvin](https://github.com/litvintech) by
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and
 * Galt•Space Society Construction and Terraforming Company by
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

pragma solidity 0.5.7;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "@galtproject/libs/contracts/traits/Permissionable.sol";
import "@galtproject/libs/contracts/collections/ArraySet.sol";
import "../registries/GaltGlobalRegistry.sol";
import "./interfaces/IPGGConfig.sol";
import "./interfaces/IPGGArbitratorStakeAccounting.sol";
import "./interfaces/IPGGOracleStakeAccounting.sol";
import "./interfaces/IPGGMultiSig.sol";
import "./voting/interfaces/IPGGDelegateReputationVoting.sol";
import "./voting/interfaces/IPGGOracleStakeVoting.sol";
import "./voting/interfaces/IPGGMultiSigCandidateTop.sol";
import "./PGGMultiSig.sol";


contract PGGConfig is IPGGConfig, Permissionable {
  using ArraySet for ArraySet.AddressSet;

  string public constant THRESHOLD_MANAGER = "threshold_manager";
  string public constant M_N_MANAGER = "m_n_manager";
  string public constant MINIMAL_ARBITRATOR_STAKE_MANAGER = "minimal_arbitrator_stake_manager";
  string public constant CONTRACT_ADDRESS_MANAGER = "contract_address_manager";
  string public constant APPLICATION_CONFIG_MANAGER = "application_config_manager";

  string public constant CREATE_GLOBAL_PROPOSAL_MANAGER = "create_global_proposal_manager";
  string public constant SUPPORT_GLOBAL_PROPOSAL_MANAGER = "support_global_proposal_manager";
  string public constant EXTERNAL_ROLE_MANAGER = "external_role_manager";

  bytes32 public constant SET_THRESHOLD_THRESHOLD = bytes32("set_threshold_threshold");
  bytes32 public constant SET_M_OF_N_THRESHOLD = bytes32("set_m_of_n_threshold");
  bytes32 public constant CHANGE_MINIMAL_ARBITRATOR_STAKE_THRESHOLD = bytes32("arbitrator_stake_threshold");
  bytes32 public constant CHANGE_CONTRACT_ADDRESS_THRESHOLD = bytes32("change_contract_threshold");
  bytes32 public constant REVOKE_ARBITRATORS_THRESHOLD = bytes32("revoke_arbitrators_threshold");
  bytes32 public constant APPLICATION_CONFIG_THRESHOLD = bytes32("application_config_threshold");
  bytes32 public constant CREATE_GLOBAL_PROPOSAL_THRESHOLD = bytes32("create_global_prop_threshold");
  bytes32 public constant SUPPORT_GLOBAL_PROPOSAL_THRESHOLD = bytes32("support_global_prop_threshold");
  bytes32 public constant EXTERNAL_ROLE_PROPOSAL_THRESHOLD = bytes32("external_role_threshold");

  bytes32 public constant MULTI_SIG_CONTRACT = bytes32("multi_sig_contract");
  bytes32 public constant ORACLES_CONTRACT = bytes32("oracles_contract");
  bytes32 public constant ORACLE_STAKES_CONTRACT = bytes32("oracle_stakes_contract");
  bytes32 public constant ARBITRATOR_STAKES_CONTRACT = bytes32("arbitrator_stakes_contract");
  bytes32 public constant ARBITRATION_CANDIDATE_TOP_CONTRACT = bytes32("candidate_top_contract");
  bytes32 public constant DELEGATE_SPACE_VOTING_CONTRACT = bytes32("delegate_space_voting_contract");
  bytes32 public constant DELEGATE_GALT_VOTING_CONTRACT = bytes32("delegate_galt_voting_contract");
  bytes32 public constant ORACLE_STAKE_VOTING_CONTRACT = bytes32("oracle_stake_voting_contract");

  // Notifies StakeTracker about stake changes
  bytes32 public constant STAKE_TRACKER_NOTIFIER_ROLE = bytes32("stake_tracker_notifier");
  // Creates new global governance proposals
  bytes32 public constant GLOBAL_PROPOSAL_CREATOR_ROLE = bytes32("global_proposal_creator");

  mapping(bytes32 => uint256) public thresholds;
  mapping(bytes32 => address) public contracts;
  mapping(bytes32 => bytes32) public applicationConfig;
  mapping(uint256 => bool) public globalProposalSupport;
  mapping(bytes32 => ArraySet.AddressSet) private externalRoles;

  uint256 public minimalArbitratorStake;

  bool initialized;

  // initial voting => multiSig required
  uint256 public m;
  // initial voting => multiSig total
  uint256 public n;

  GaltGlobalRegistry public ggr;

  constructor (
    GaltGlobalRegistry _ggr,
    uint256 _m,
    uint256 _n,
    uint256 _minimalArbitratorStake,
    // 0 - SET_THRESHOLD_THRESHOLD
    // 1 - SET_M_OF_N_THRESHOLD
    // 2 - CHANGE_MINIMAL_ARBITRATOR_STAKE_THRESHOLD
    // 3 - CHANGE_CONTRACT_ADDRESS_THRESHOLD
    // 4 - REVOKE_ARBITRATORS_THRESHOLD
    uint256[] memory _thresholds
  ) public {
    ggr = _ggr;

    m = _m;
    n = _n;
    minimalArbitratorStake = _minimalArbitratorStake;

    require(_thresholds.length == 8, "Invalid number of thresholds passed in");

    thresholds[SET_THRESHOLD_THRESHOLD] = _thresholds[0];
    thresholds[SET_M_OF_N_THRESHOLD] = _thresholds[1];
    thresholds[CHANGE_MINIMAL_ARBITRATOR_STAKE_THRESHOLD] = _thresholds[2];
    thresholds[CHANGE_CONTRACT_ADDRESS_THRESHOLD] = _thresholds[3];
    thresholds[REVOKE_ARBITRATORS_THRESHOLD] = _thresholds[4];
    thresholds[APPLICATION_CONFIG_THRESHOLD] = _thresholds[5];
    thresholds[CREATE_GLOBAL_PROPOSAL_THRESHOLD] = _thresholds[6];
    thresholds[SUPPORT_GLOBAL_PROPOSAL_THRESHOLD] = _thresholds[7];
  }

  function initialize(
    IPGGMultiSig _arbitratorMultiSig,
    IPGGMultiSigCandidateTop _arbitratorVoting,
    IPGGArbitratorStakeAccounting _arbitratorStakeAccounting,
    IPGGOracleStakeAccounting _oracleStakesAccounting,
    IPGGOracles _arbitrationOracles,
    IPGGDelegateReputationVoting _delegateSpaceVoting,
    IPGGDelegateReputationVoting _delegateGaltVoting,
    IPGGOracleStakeVoting _oracleStakeVoting
  )
    external
  {
    assert(initialized == false);
    assert(hasRole(msg.sender, "role_manager"));

    contracts[MULTI_SIG_CONTRACT] = address(_arbitratorMultiSig);
    contracts[ARBITRATION_CANDIDATE_TOP_CONTRACT] = address(_arbitratorVoting);
    contracts[ARBITRATOR_STAKES_CONTRACT] = address(_arbitratorStakeAccounting);
    contracts[ORACLE_STAKES_CONTRACT] = address(_oracleStakesAccounting);
    contracts[ORACLES_CONTRACT] = address(_arbitrationOracles);
    contracts[DELEGATE_SPACE_VOTING_CONTRACT] = address(_delegateSpaceVoting);
    contracts[DELEGATE_GALT_VOTING_CONTRACT] = address(_delegateGaltVoting);
    contracts[ORACLE_STAKE_VOTING_CONTRACT] = address(_oracleStakeVoting);

    initialized = true;
  }

  function setThreshold(bytes32 _key, uint256 _value) external onlyRole(THRESHOLD_MANAGER) {
    require(_value <= 100, "Value should be less than 100");
    thresholds[_key] = _value;
  }

  function setMofN(uint256 _m, uint256 _n) external onlyRole(M_N_MANAGER) {
    require(2 <= _m, "Should satisfy `2 <= m`");
    require(3 <= _n, "Should satisfy `3 <= n`");
    require(_m <= _n, "Should satisfy `m <= n`");

    m = _m;
    n = _n;
  }

  function setMinimalArbitratorStake(uint256 _value) external onlyRole(MINIMAL_ARBITRATOR_STAKE_MANAGER) {
    minimalArbitratorStake = _value;
  }

  function setContractAddress(bytes32 _key, address _address) external onlyRole(CONTRACT_ADDRESS_MANAGER) {
    contracts[_key] = _address;
  }

  function setApplicationConfigValue(bytes32 _key, bytes32 _value) external onlyRole(APPLICATION_CONFIG_MANAGER) {
    applicationConfig[_key] = _value;
  }

  function addExternalRoleTo(address _address, bytes32 _role) external onlyRole(EXTERNAL_ROLE_MANAGER) {
    externalRoles[_role].add(_address);
  }

  function removeExternalRoleFrom(address _address, bytes32 _role) external onlyRole(EXTERNAL_ROLE_MANAGER) {
    externalRoles[_role].remove(_address);
  }

  function setGlobalProposalSupport(
    uint256 _globalProposalId,
    bool _isSupported
  )
    external
    onlyRole(SUPPORT_GLOBAL_PROPOSAL_MANAGER)
  {
    globalProposalSupport[_globalProposalId] = _isSupported;
  }

  // GETTERS (TODO: replace contract getters with interfaces only)
  function getMultiSig() external view returns (IPGGMultiSig) {
    address payable ms = address(uint160(contracts[MULTI_SIG_CONTRACT]));
    return IPGGMultiSig(ms);
  }

  function getArbitrationCandidateTop() external view returns (IPGGMultiSigCandidateTop) {
    return IPGGMultiSigCandidateTop(contracts[ARBITRATION_CANDIDATE_TOP_CONTRACT]);
  }

  function getArbitratorStakes() external view returns (IPGGArbitratorStakeAccounting) {
    return IPGGArbitratorStakeAccounting(contracts[ARBITRATOR_STAKES_CONTRACT]);
  }

  function getOracles() external view returns (IPGGOracles) {
    return IPGGOracles(contracts[ORACLES_CONTRACT]);
  }

  function getOracleStakes() external view returns (IPGGOracleStakeAccounting) {
    return IPGGOracleStakeAccounting(contracts[ORACLE_STAKES_CONTRACT]);
  }

  function getDelegateSpaceVoting() external view returns (IPGGDelegateReputationVoting) {
    return IPGGDelegateReputationVoting(contracts[DELEGATE_SPACE_VOTING_CONTRACT]);
  }

  function getDelegateGaltVoting() external view returns (IPGGDelegateReputationVoting) {
    return IPGGDelegateReputationVoting(contracts[DELEGATE_GALT_VOTING_CONTRACT]);
  }

  function getOracleStakeVoting() external view returns (IPGGOracleStakeVoting) {
    return IPGGOracleStakeVoting(contracts[ORACLE_STAKE_VOTING_CONTRACT]);
  }

  function getExternalRoles(bytes32 _role) external view returns(address[] memory) {
    return externalRoles[_role].elements();
  }

  function hasExternalRole(bytes32 _role, address _address) external view returns(bool) {
    return externalRoles[_role].has(_address);
  }
}
