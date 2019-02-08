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
import "../vendor/MultiSigWallet/MultiSigWallet.sol";
import "./ArbitratorStakeAccounting.sol";

contract ArbitratorsMultiSig is MultiSigWallet, Permissionable {
  event NewAuditorsSet(address[] auditors, uint256 required, uint256 total);
  event GaltRunningTotalIncrease(
    uint256 periodId,
    uint256 runningTotalBefore,
    uint256 runningTotalAfter,
    uint256 amount
  );

  string public constant ROLE_PROPOSER = "proposer";
  string public constant ROLE_ARBITRATOR_MANAGER = "arbitrator_manager";

  address public arbitratorVoting;
  ArbitratorStakeAccounting public arbitratorStakeAccounting;
  address public oracleStakesAccounting;
  address public galtToken;
  address public initializer;
  bool initialized;

  mapping(uint256 => uint256) _periodRunningTotal;

  modifier forbidden() {
    assert(false);
    _;
  }

  constructor(
    address[] memory _initialOwners,
    uint256 _required
  )
    public
    MultiSigWallet(_initialOwners, _required)
  {
    initializer = msg.sender;
  }

  function addOwner(address owner) public forbidden {}
  function removeOwner(address owner) public forbidden {}
  function replaceOwner(address owner, address newOwner) public forbidden {}
  function changeRequirement(uint _required) public forbidden {}

  /*
   * @dev ROLE_AUTO_PROPOSER role could propose any transaction such as
   * funds transfer or external method invocation.
   *
   * @param destination Transaction target address.
   * @param value Transaction ether value.
   * @param data Transaction data payload.
   * @return Returns transaction ID.
   */
  function proposeTransaction(address destination, uint value, bytes calldata data)
    external
    onlyRole(ROLE_PROPOSER)
    returns (uint transactionId)
  {
    transactionId = addTransaction(destination, value, data);
  }

  /**
   * @dev Set a new arbitrators list with (N-of-M multisig)
   * @param m required number of signatures
   * @param n number of validators to slice for a new list
   * @param descArbitrators list of all arbitrators from voting
   */
  function setArbitrators(
    uint256 m,
    uint256 n,
    address[] calldata descArbitrators
  )
    external
    onlyRole(ROLE_ARBITRATOR_MANAGER)
  {
    require(descArbitrators.length <= n, "Arbitrators array size greater than required");
    required = m;

    delete owners;

    for (uint8 i = 0; i < descArbitrators.length; i++) {
      address o = descArbitrators[i];

      isOwner[o] = true;
      owners.push(o);

      emit OwnerAddition(o);
    }

    emit NewAuditorsSet(owners, m, n);
  }

  // WARNING: GaltToken address should be hardcoded in production version
  function setGaltToken(address _galtToken) external {
    galtToken = _galtToken;
  }

  function external_call(address destination, uint value, uint dataLength, bytes memory data) private returns (bool) {
    if (destination == galtToken) {
      checkGaltLimits(data);
    }

      // TODO: repeat logic
  }

  function checkGaltLimits(bytes memory data) internal {
    uint256 galtValue;

    assembly {
      let code := mload(add(data, 0x20))
      code := and(code, 0xffffffff00000000000000000000000000000000000000000000000000000000)

      switch code
      // transfer(address,uint256)
      case 0xa9059cbb00000000000000000000000000000000000000000000000000000000 {
        galtValue := mload(add(data, 0x40))
      }
      default {
        // Methods other than transfer are prohibited for GALT contract
        revert(0, 0)
      }
    }

    if (galtValue == 0) {
      return;
    }

    (uint256 currentPeriodId, uint256 totalStakes) = arbitratorStakeAccounting.getCurrentPeriodAndTotalSupply();
    uint256 runningTotalBefore = _periodRunningTotal[currentPeriodId];
    uint256 runningTotalAfter = _periodRunningTotal[currentPeriodId] + galtValue;

    assert(runningTotalAfter > runningTotalBefore);
    assert(runningTotalAfter <= totalStakes);

    _periodRunningTotal[currentPeriodId] = runningTotalAfter;

    emit GaltRunningTotalIncrease(
      currentPeriodId,
      runningTotalBefore,
      runningTotalAfter,
      galtValue
    );
  }

  function checkGaltLimitsExternal(bytes calldata data) external {
    checkGaltLimits(data);
  }

  function initialize(
    address _arbitratorVoting,
    address _oracleStakesAccounting,
    ArbitratorStakeAccounting _arbitratorStakeAccounting
  )
    external
  {
    assert(initialized == false);
    assert(hasRole(msg.sender, "role_manager"));

    arbitratorVoting = _arbitratorVoting;
    oracleStakesAccounting = _oracleStakesAccounting;
    arbitratorStakeAccounting = _arbitratorStakeAccounting;
    initialized = true;
  }

  // GETTERS
  function getArbitrators() public view returns (address[] memory) {
    return owners;
  }
}
