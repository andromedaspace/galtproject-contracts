pragma solidity ^0.5.13;

import "../GlobalGovernance.sol";


/* solium-disable-next-line */
contract MockGlobalGovernance_V2 is GlobalGovernance {
  function foo() public pure returns(string memory) {
    return "bar";
  }
}
