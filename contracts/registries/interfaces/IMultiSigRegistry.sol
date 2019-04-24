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

import "../../multisig/interfaces/IArbitrationConfig.sol";
import "../../multisig/interfaces/IArbitratorsMultiSig.sol";


interface IMultiSigRegistry {
  function addMultiSig(
    IArbitratorsMultiSig _abMultiSig,
    IArbitrationConfig _arbitrationConfig
  ) external;
  function requireValidMultiSig(address _multiSig) external view;
  function isMultiSigValid(address _multiSig) external view returns(bool);
  function getArbitrationConfig(address _multiSig) external view returns (IArbitrationConfig);
  function getMultiSigList() external view returns (address[] memory);
  function getConfigList() external view returns (address[] memory);
  function getMultiSigCount() external view returns (uint256);
}
