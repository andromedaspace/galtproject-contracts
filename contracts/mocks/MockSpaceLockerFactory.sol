pragma solidity 0.5.7;

import "../factories/SpaceLockerFactory.sol";
import "./MockSpaceLocker.sol";


contract MockSpaceLockerFactory is SpaceLockerFactory {
  constructor (GaltGlobalRegistry _ggr) public SpaceLockerFactory(_ggr) { }

  function buildMock(address _owner) external payable returns (ISpaceLocker) {
    ISpaceLocker locker = new MockSpaceLocker(ggr, _owner);

    ILockerRegistry(ggr.getSpaceLockerRegistryAddress()).addLocker(address(locker));

    emit SpaceLockerCreated(_owner, address(locker));

    return ISpaceLocker(locker);
  }
}
