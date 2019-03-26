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
import "../interfaces/ILocker.sol";
import "./interfaces/ILockerRegistry.sol";


contract LockerRegistry is ILockerRegistry, Permissionable {
  using ArraySet for ArraySet.AddressSet;

  string public constant ROLE_FACTORY = "factory";

  // SpaceLocker address => Details
  mapping(address => Details) public lockers;

  // SpaceLocker address => Details
  mapping(address => ArraySet.AddressSet) private lockersByOwner;

  struct Details {
    bool active;
    address factory;
  }

  event LockerAdded(address indexed locker, address indexed owner, address factory);

  function addSpaceLocker(address _locker) external onlyRole(ROLE_FACTORY) {
    Details storage l = lockers[_locker];

    l.active = true;
    l.factory = msg.sender;

    lockersByOwner[ILocker(_locker).owner()].add(_locker);

    emit LockerAdded(_locker, ILocker(_locker).owner(), l.factory);
  }

  // REQUIRES

  function requireValidLocker(address _locker) external view {
    require(lockers[_locker].active, "SpaceLocker address is invalid");
  }

  function isValid(address _locker) external view returns (bool) {
    return lockers[_locker].active;
  }

  // GETTERS
  function getLockersListByOwner(address _owner) external view returns (address[] memory) {
    return lockersByOwner[_owner].elements();
  }

  function getLockersCountByOwner(address _owner) external view returns (uint256) {
    return lockersByOwner[_owner].size();
  }
}
