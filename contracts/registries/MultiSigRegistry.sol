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

import "@galtproject/libs/contracts/traits/Permissionable.sol";
import "@galtproject/libs/contracts/collections/ArraySet.sol";
import "../multisig/ArbitratorsMultiSig.sol";
import "../multisig/ArbitrationConfig.sol";
import "../multisig/OracleStakesAccounting.sol";


contract MultiSigRegistry is Permissionable {
  using ArraySet for ArraySet.AddressSet;

  string public constant ROLE_FACTORY = "space_token";

  // MultiSig address => Details
  // TODO: need to be a private?
  mapping(address => MultiSig) public multiSigs;
  ArraySet.AddressSet private multiSigArray;

  struct MultiSig {
    bool active;
    ArbitrationConfig arbitrationConfig;
    address factoryAddress;
  }

  function addMultiSig(
    ArbitratorsMultiSig _abMultiSig,
    ArbitrationConfig _arbitrationConfig
  )
    external
    onlyRole(ROLE_FACTORY)
  {
    MultiSig storage ms = multiSigs[address(_abMultiSig)];

    ms.active = true;
    ms.arbitrationConfig = _arbitrationConfig;
    ms.factoryAddress = msg.sender;

    multiSigArray.add(address(_abMultiSig));
  }

  // REQUIRES

  function requireValidMultiSig(address _multiSig) external view {
    require(multiSigs[_multiSig].active, "MultiSig address is invalid");
  }

  // GETTERS

  function getArbitrationConfig(address _multiSig) external view returns (ArbitrationConfig) {
    return multiSigs[_multiSig].arbitrationConfig;
  }

  function getMultiSigList() external returns (address[] memory) {
    return multiSigArray.elements();
  }

  function getMultiSigCount() external returns (uint256) {
    return multiSigArray.size();
  }
  // TODO: how to update Factory Address?
  // TODO: how to deactivate multiSig?
}
