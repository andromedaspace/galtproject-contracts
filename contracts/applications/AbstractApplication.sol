/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "@galtproject/libs/contracts/traits/Initializable.sol";
import "../registries/interfaces/IPGGRegistry.sol";
import "../registries/interfaces/IFeeRegistry.sol";
import "../registries/GaltGlobalRegistry.sol";
import "../pgg/interfaces/IPGGConfig.sol";


contract AbstractApplication is Initializable {

  bytes32 public constant ROLE_FEE_COLLECTOR = bytes32("FEE_COLLECTOR");
  bytes32 public constant ROLE_APPLICATION_BYTECODE_EXECUTOR = bytes32("APPLICATION_BYTECODE_EXECUTOR");

  event ExecuteBytecode(bool success, address destination);

  enum Currency {
    ETH,
    GALT
  }

  enum PaymentMethod {
    NONE,
    ETH_ONLY,
    GALT_ONLY,
    ETH_AND_GALT
  }

  enum PaymentType {
    ETH,
    GALT
  }

  uint256 public protocolFeesEth;
  uint256 public protocolFeesGalt;

  uint256 internal idCounter;

  GaltGlobalRegistry internal ggr;

  mapping(address => uint256[]) public applicationsByApplicant;

  constructor() public {}

  modifier onlyFeeCollector() {
    require(
      ggr.getACL().hasRole(msg.sender, ROLE_FEE_COLLECTOR),
      "Only FEE_COLLECTOR role allowed"
    );
    _;
  }

  modifier onlyApplicationBytecodeExecutor() {
    require(
      ggr.getACL().hasRole(msg.sender, ROLE_APPLICATION_BYTECODE_EXECUTOR),
      "Only APPLICATION_BYTECODE_EXECUTOR role allowed"
    );
    _;
  }

  // CONFIG GETTERS

  function paymentMethod(address _pgg) public view returns (PaymentMethod);

  // EXTERNAL

  /**
   * @notice Executes a random bytecode on behalf of contract. This would allow the contract owner recover the tokens
   *         allocated on the contract in case when the contract had been broken.
   * @dev Should be deleted after a proper code audit.
   */
  function executeBytecode(
    address _destination,
    uint256 _value,
    bytes calldata _data
  )
    external
    onlyApplicationBytecodeExecutor
  {
    (bool success,) = address(_destination).call.value(_value)(_data);

    assert(success == true);

    emit ExecuteBytecode(success, _destination);
  }

  /**
   * @notice Transfer all the Galt Protocol collected fees in ETH to the fee controller address
   */
  function claimGaltProtocolFeeEth() external onlyFeeCollector {
    require(address(this).balance >= protocolFeesEth, "Insufficient balance");
    msg.sender.transfer(protocolFeesEth);
    protocolFeesEth = 0;
  }

  /**
   * @notice Transfer all the Galt Protocol collected fees in GALT to the fee controller address
   */
  function claimGaltProtocolFeeGalt() external {
    require(ggr.getGaltToken().balanceOf(address(this)) >= protocolFeesGalt, "Insufficient balance");
    ggr.getGaltToken().transfer(msg.sender, protocolFeesGalt);
    protocolFeesGalt = 0;
  }

  // INTERNAL

  function nextId() internal returns (uint256) {
    idCounter += 1;
    return idCounter;
  }

  function requireValidPaymentType(address _pgg, PaymentType _paymentType) internal view {
    PaymentMethod pm = paymentMethod(_pgg);

    if (_paymentType == PaymentType.ETH) {
      require(pm == PaymentMethod.ETH_AND_GALT || pm == PaymentMethod.ETH_ONLY, "Invalid payment type");
    } else if (_paymentType == PaymentType.GALT) {
      require(pm == PaymentMethod.ETH_AND_GALT || pm == PaymentMethod.GALT_ONLY, "Invalid payment type");
    }
  }

  // INTERNAL GETTERS

  function getProtocolShares() internal view returns(uint256 ethFee, uint256 galtFee) {
    return IFeeRegistry(ggr.getFeeRegistryAddress()).getProtocolApplicationShares();
  }

  function pggRegistry() internal view returns(IPGGRegistry) {
    return IPGGRegistry(ggr.getPggRegistryAddress());
  }

  function pggConfig(address _pgg) internal view returns (IPGGConfig) {
    pggRegistry().requireValidPgg(_pgg);

    return IPGGConfig(_pgg);
  }

  function pggConfigValue(address _pgg, bytes32 _key) internal view returns (bytes32) {
    return pggConfig(_pgg).applicationConfig(_key);
  }

  // GETTERS

  function getApplicationsByApplicant(address _applicant) external view returns (uint256[] memory) {
    return applicationsByApplicant[_applicant];
  }
}
