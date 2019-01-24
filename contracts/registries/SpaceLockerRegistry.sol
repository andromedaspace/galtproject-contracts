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

import "@galtproject/galtproject-libs/contracts/traits/Permissionable.sol";
import "../interfaces/ISpaceLocker.sol";


contract SpaceLockerRegistry is Permissionable {
  string public constant ROLE_FACTORY = "space_token";

  // SpaceLocker address => Details
  mapping(address => Details) public spaceLockers;

  struct Details {
    bool active;
    address factoryAddress;
  }

  function addSpaceLocker(ISpaceLocker _spaceLocker) external onlyRole(ROLE_FACTORY) {
    Details storage sl = spaceLockers[address(_spaceLocker)];

    sl.active = true;
    sl.factoryAddress = msg.sender;
  }

  // REQUIRES

  function requireValidLocker(address _spaceLocker) external view {
    require(spaceLockers[_spaceLocker].active, "SpaceLocker address is invalid");
  }

  function isValid(address _spaceLocker) external view returns (bool) {
    return spaceLockers[_spaceLocker].active;
  }
  // TODO: how to update Factory Address?
  // TODO: how to deactivate multiSig?
}
