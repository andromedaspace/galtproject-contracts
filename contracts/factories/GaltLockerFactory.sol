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

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "../registries/interfaces/ILockerRegistry.sol";
import "../registries/interfaces/IFeeRegistry.sol";
import "../GaltLocker.sol";

contract GaltLockerFactory is Ownable {
  event GaltLockerCreated(address owner, address locker);

  bytes32 public constant FEE_KEY = bytes32("GALT_LOCKER_FACTORY");
  bytes32 public constant ROLE_FEE_COLLECTOR = bytes32("FEE_COLLECTOR");

  GaltGlobalRegistry ggr;

  constructor (
    GaltGlobalRegistry _ggr
  ) public {
    ggr = _ggr;
  }

  modifier onlyFeeCollector() {
    require(
      ggr.getACL().hasRole(msg.sender, ROLE_FEE_COLLECTOR),
      "Only FEE_COLLECTOR role allowed"
    );
    _;
  }

  function _acceptPayment() internal {
    if (msg.value == 0) {
      uint256 fee = IFeeRegistry(ggr.getFeeRegistryAddress()).getGaltFeeOrRevert(FEE_KEY);
      ggr.getGaltToken().transferFrom(msg.sender, address(this), fee);
    } else {
      uint256 fee = IFeeRegistry(ggr.getFeeRegistryAddress()).getEthFeeOrRevert(FEE_KEY);
      require(msg.value == fee, "Fee and msg.value not equal");
    }
  }

  function build() external payable returns (IGaltLocker) {
    _acceptPayment();

    IGaltLocker locker = new GaltLocker(ggr, msg.sender);

    ILockerRegistry(ggr.getGaltLockerRegistryAddress()).addLocker(address(locker));

    emit GaltLockerCreated(msg.sender, address(locker));

    return locker;
  }

  function withdrawEthFees() external onlyFeeCollector {
    msg.sender.transfer(address(this).balance);
  }

  function withdrawGaltFees() external onlyFeeCollector {
    IERC20 galtToken = ggr.getGaltToken();
    galtToken.transfer(msg.sender, galtToken.balanceOf(address(this)));
  }
}
