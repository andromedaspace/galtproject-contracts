pragma solidity 0.4.24;
pragma experimental "v0.5.0";

import "./MockToken.sol";


contract MockToken_V2 is MockToken {
  constructor() public {
  }

  function faucet() public {
    uint256 _amount = 87 ether;
    _mint(msg.sender, _amount);
  }
}
