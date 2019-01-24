pragma solidity 0.5.3;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";
import "../traits/Initializable.sol";
// TODO: remove initializer


contract MockToken is Initializable, ERC20Mintable {
  // solium-disable-next-line uppercase
  string public constant name = "Mock Token";

  // solium-disable-next-line uppercase
  string public constant symbol = "MALT";

  // solium-disable-next-line uppercase
  uint8 public constant decimals = 18;

  uint256 public constant INITIAL_SUPPLY = 0;

  constructor() public {
  }

  function initialize() public isInitializer {
    _mint(msg.sender, INITIAL_SUPPLY);
  }
}
