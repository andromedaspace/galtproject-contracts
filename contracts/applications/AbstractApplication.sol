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

pragma solidity 0.5.3;

import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "@galtproject/libs/contracts/traits/Initializable.sol";
import "@galtproject/libs/contracts/traits/Permissionable.sol";
import "../Oracles.sol";
import "../registries/interfaces/IMultiSigRegistry.sol";
import "../registries/GaltGlobalRegistry.sol";


contract AbstractApplication is Initializable, Permissionable {
  string public constant ROLE_FEE_MANAGER = "fee_manager";
  string public constant ROLE_GALT_SPACE = "galt_space";

//  uint256 public minimalApplicationFeeInEth;
//  uint256 public minimalApplicationFeeInGalt;
  uint256 public galtSpaceEthShare;
  uint256 public galtSpaceGaltShare;
  address internal galtSpaceRewardsAddress;

  GaltGlobalRegistry public ggr;

  bytes32[] internal applicationsArray;
  mapping(address => bytes32[]) public applicationsByApplicant;

  enum Currency {
    ETH,
    GALT
  }

  enum PaymentMethod {
    NONE,
    ETH_ONLY,
    GALT_ONLY,
    ETH_AND_GALT
  }

  modifier onlyFeeManager() {
    requireRole(msg.sender, ROLE_FEE_MANAGER);
    _;
  }

  constructor() public {}

  function claimGaltSpaceReward(bytes32 _aId) external;
  function paymentMethod(address _multiSig) internal view returns (PaymentMethod);
  function getOracleTypeShareKey(bytes32 _oracleType) public pure returns (bytes32);

  function multiSigRegistry() internal view returns(IMultiSigRegistry) {
    return IMultiSigRegistry(ggr.getMultiSigRegistryAddress());
  }

  function applicationConfig(address _multiSig, bytes32 _key) internal view returns (bytes32) {
    return multiSigRegistry().getArbitrationConfig(_multiSig).applicationConfig(_key);
  }

  function oracleTypeShare(address _multiSig, bytes32 _oracleType) internal view returns (uint256) {
    uint256 val = uint256(applicationConfig(_multiSig, getOracleTypeShareKey(_oracleType)));

    assert(val <= 100);

    return val;
  }

  function getAllApplications() external view returns (bytes32[] memory) {
    return applicationsArray;
  }

  function getApplicationsByApplicant(address _applicant) external view returns (bytes32[] memory) {
    return applicationsByApplicant[_applicant];
  }
}
