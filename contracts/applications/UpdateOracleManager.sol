/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "./ArbitratorApprovableApplication.sol";


contract UpdateOracleManager is ArbitratorApprovableApplication {

  bytes32 public constant CONFIG_MINIMAL_FEE_ETH = bytes32("UO_MINIMAL_FEE_ETH");
  bytes32 public constant CONFIG_MINIMAL_FEE_GALT = bytes32("UO_MINIMAL_FEE_GALT");
  bytes32 public constant CONFIG_PAYMENT_METHOD = bytes32("UO_PAYMENT_METHOD");
  bytes32 public constant CONFIG_M = bytes32("UO_M");
  bytes32 public constant CONFIG_N = bytes32("UO_N");
  bytes32 public constant CONFIG_PREFIX = bytes32("UO");

  struct OracleDetails {
    address pgg;
    address addr;
    string name;
    bytes32 position;
    string description;
    bytes32[] descriptionHashes;
    bytes32[] oracleTypes;
  }

  mapping(uint256 => OracleDetails) oracleDetails;

  constructor() public {}

  function initialize(
    GaltGlobalRegistry _ggr
  )
    public
    isInitializer
  {
    _initialize(_ggr);
  }

  // CONFIG GETTERS

  function minimalApplicationFeeEth(address _pgg) internal view returns (uint256) {
    return uint256(pggConfigValue(_pgg, CONFIG_MINIMAL_FEE_ETH));
  }

  function minimalApplicationFeeGalt(address _pgg) internal view returns (uint256) {
    return uint256(pggConfigValue(_pgg, CONFIG_MINIMAL_FEE_GALT));
  }

  // arbitrators count required
  function m(address _pgg) public view returns (uint256) {
    return uint256(pggConfigValue(_pgg, CONFIG_M));
  }

  // total arbitrators count able to lock the claim
  function n(address _pgg) public view returns (uint256) {
    return uint256(pggConfigValue(_pgg, CONFIG_N));
  }

  function paymentMethod(address _pgg) public view returns (PaymentMethod) {
    return PaymentMethod(uint256(pggConfigValue(_pgg, CONFIG_PAYMENT_METHOD)));
  }

  // EXTERNAL

  function submit(
    address payable _pgg,
    address _oracleAddress,
    string calldata _name,
    bytes32 _position,
    string calldata _description,
    bytes32[] calldata _descriptionHashes,
    bytes32[] calldata _oracleTypes,
    uint256 _applicationFeeInGalt
  )
    external
    payable
  {
    pggConfig(_pgg).getOracles().requireOracleActive(_oracleAddress);
    require(_descriptionHashes.length > 0, "Description hashes required");
    require(_oracleTypes.length > 0, "Oracle Types required");

    uint256 id = nextId();

    OracleDetails memory o;
    o.addr = _oracleAddress;
    o.name = _name;
    o.position = _position;
    o.pgg = _pgg;
    o.descriptionHashes = _descriptionHashes;
    o.description = _description;
    o.oracleTypes = _oracleTypes;

    oracleDetails[id] = o;

    _submit(id, _pgg, _applicationFeeInGalt);
  }

  // INTERNAL

  function _execute(uint256 _id) internal {
    OracleDetails storage d = oracleDetails[_id];
    Application storage a = applications[_id];

    pggConfig(a.pgg)
      .getOracles()
      .addOracle(d.addr, d.name, d.position, d.description, d.descriptionHashes, d.oracleTypes);
  }

  // GETTERS

  function getApplicationOracle(
    uint256 _id
  )
    external
    view
    returns (
      address pgg,
      address addr,
      bytes32 position,
      string memory name,
      string memory description,
      bytes32[] memory descriptionHashes,
      bytes32[] memory oracleTypes
    )
  {
    OracleDetails storage o = oracleDetails[_id];
    Application storage a = applications[_id];

    return (
      a.pgg,
      o.addr,
      o.position,
      o.name,
      o.description,
      o.descriptionHashes,
      o.oracleTypes
    );
  }
}
