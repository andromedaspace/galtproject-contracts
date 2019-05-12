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

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "@galtproject/libs/contracts/collections/ArraySet.sol";
import "./ArbitratorsMultiSig.sol";
import "./ArbitrationConfig.sol";
import "./interfaces/IArbitratorStakeAccounting.sol";


contract ArbitratorStakeAccounting is IArbitratorStakeAccounting {
  using SafeMath for uint256;
  using ArraySet for ArraySet.AddressSet;

  event ArbitratorStakeDeposit(
    address arbitrator,
    uint256 amount,
    uint256 arbitratorStakeBefore,
    uint256 arbitratorStakeAfter
  );

  event ArbitratorStakeSlash(
    address arbitrator,
    uint256 amount,
    uint256 arbitratorStakeBefore,
    uint256 arbitratorStakeAfter
  );

  bytes32 public constant ROLE_ARBITRATION_STAKE_SLASHER = bytes32("ARBITRATION_STAKE_SLASHER");

  uint256 public totalStakes;
  uint256 public periodLengthInSeconds;
  uint256 internal _initialTimestamp;
  ArbitrationConfig internal arbitrationConfig;
  ArraySet.AddressSet arbitrators;
  mapping(address => uint256) _balances;

  modifier onlySlashManager {
    require(
      arbitrationConfig.ggr().getACL().hasRole(msg.sender, ROLE_ARBITRATION_STAKE_SLASHER),
      "Only ARBITRATION_STAKE_SLASHER role allowed"
    );

    _;
  }

  constructor(
    ArbitrationConfig _arbitrationConfig,
    uint256 _periodLengthInSeconds
  )
    public
  {
    arbitrationConfig = _arbitrationConfig;
    periodLengthInSeconds = _periodLengthInSeconds;
    _initialTimestamp = block.timestamp;
  }

  function slash(address _arbitrator, uint256 _amount) external onlySlashManager {
    _slash(_arbitrator, _amount);
  }

  function slashMultiple(address[] calldata _arbitrators, uint256[] calldata _amounts) external onlySlashManager {
    assert(_arbitrators.length == _amounts.length);

    for (uint256 i = 0; i < _arbitrators.length; i++) {
      _slash(_arbitrators[i], _amounts[i]);
    }
  }

  function _slash(address _arbitrator, uint256 _amount) internal {
    uint256 arbitratorStakeBefore = _balances[_arbitrator];
    uint256 arbitratorStakeAfter = arbitratorStakeBefore.sub(_amount);

    _balances[_arbitrator] = arbitratorStakeAfter;
    totalStakes -= _amount;

    emit ArbitratorStakeSlash(_arbitrator, _amount, arbitratorStakeBefore, arbitratorStakeAfter);
  }

  function stake(address _arbitrator, uint256 _amount) external {
    require(_amount > 0, "Expect positive amount");

    address multiSig = address(arbitrationConfig.getMultiSig());

    arbitrationConfig.ggr().getGaltToken().transferFrom(msg.sender, multiSig, _amount);

    uint256 arbitratorStakeBefore = _balances[_arbitrator];
    uint256 arbitratorStakeAfter = arbitratorStakeBefore.add(_amount);

    _balances[_arbitrator] = arbitratorStakeAfter;
    totalStakes += _amount;

    emit ArbitratorStakeDeposit(_arbitrator, _amount, arbitratorStakeBefore, arbitratorStakeAfter);
  }

  function getCurrentPeriodAndTotalSupply() external view returns (uint256, uint256) {
    return (((block.timestamp - _initialTimestamp) / periodLengthInSeconds), totalStakes);
  }

  function getCurrentPeriod() external view returns (uint256) {
    return (block.timestamp - _initialTimestamp) / periodLengthInSeconds;
  }

  function balanceOf(address _arbitrator) external view returns (uint256) {
    return _balances[_arbitrator];
  }

  function getInitialTimestamp() external view returns (uint256) {
    return _initialTimestamp;
  }
}
