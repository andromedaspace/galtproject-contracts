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

import "./AbstractApplication.sol";


contract AbstractOracleApplication is AbstractApplication {
  Oracles oracles;

  mapping(address => bytes32[]) public applicationsByOracle;

  modifier anyOracle() {
    // TODO: dangerous check
    require(oracles.isOracleActive(msg.sender), "Not active oracle");
    _;
  }

  constructor() public {}

  function claimOracleReward(bytes32 _aId) external;

  function getApplicationsByOracle(address _oracle) external view returns (bytes32[] memory) {
    return applicationsByOracle[_oracle];
  }
}
