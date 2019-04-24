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


contract ILockableRA {
  function revoke(address _from, uint256 _amount) external;
  function revokeLocked(address _delegate, address _multiSig, uint256 _amount) external;
  function lockReputation(address _multiSig, uint256 _amount) external;
  function unlockReputation(address _multiSig, uint256 _amount) external;
  function lockedBalanceOf(address _owner) external view returns (uint256);
  function lockedMultiSigBalance(address _multiSig) external view returns (uint256);
  function lockedMultiSigBalanceOf(address _owner, address _multiSig) external view returns (uint256);
  function lockedMultiSigBalances(address[] calldata _multiSigs) external view returns (uint256);
}