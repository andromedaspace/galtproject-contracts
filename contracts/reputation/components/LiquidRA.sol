/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@galtproject/libs/contracts/collections/ArraySet.sol";


contract LiquidRA {
  using SafeMath for uint256;
  using ArraySet for ArraySet.AddressSet;
  using ArraySet for ArraySet.Uint256Set;

  event Burn(address indexed owner, uint256 amount);
  event Mint(address indexed owner, uint256 amount);
  event Transfer(address indexed from, address indexed to, uint256 amount);
  event RevokeDelegated(address indexed from, address indexed owner, uint256 amount);

  // Delegate => balance
  mapping(address => uint256) internal _balances;

  // Owner => totalMinted
  mapping(address => uint256) internal _ownedBalances;

  // Reputation Owner => (Delegate => balance))
  mapping(address => mapping(address => uint256)) internal _delegatedBalances;

  mapping(address => ArraySet.AddressSet) internal _delegations;
  mapping(address => ArraySet.AddressSet) internal _delegatedBy;

  // L0
  uint256 internal totalStakedSpace;

  // PermissionED
  function revoke(address _from, uint256 _amount) public payable {
    _revokeDelegated(_from, _amount);
  }

  // INTERNAL

  function _mint(address _beneficiary, uint256 _amount) internal {
    totalStakedSpace = totalStakedSpace.add(_amount);

    _creditAccount(_beneficiary, _beneficiary, _amount);

    // _ownedBalances[_beneficiary] += _amount;
    _ownedBalances[_beneficiary] = _ownedBalances[_beneficiary].add(_amount);

    emit Mint(_beneficiary, _amount);
  }

  function _burn(address _delegate, address _benefactor, uint256 _amount) internal {
    require(_balances[_benefactor] >= _amount, "LiquidRA: Not enough funds to burn");
    require(_delegatedBalances[_benefactor][_benefactor] >= _amount, "LiquidRA: Not enough funds to burn");
    require(_ownedBalances[_benefactor] >= _amount, "LiquidRA: Not enough funds to burn");

    // totalStakedSpace -= _amount;
    totalStakedSpace = totalStakedSpace.sub(_amount);

    _debitAccount(_delegate, _benefactor, _amount);

    // _ownedBalances[_benefactor] -= _amount;
    _ownedBalances[_benefactor] = _ownedBalances[_benefactor].sub(_amount);

    emit Burn(_benefactor, _amount);
  }

  function _transfer(address _from, address _to, address _owner, uint256 _amount) internal {
    _debitAccount(_from, _owner, _amount);
    _creditAccount(_to, _owner, _amount);

    emit Transfer(_from, _to, _amount);
  }

  function _creditAccount(address _account, address _owner, uint256 _amount) internal {
    // _balances[_account] += _amount;
    _balances[_account] = _balances[_account].add(_amount);
    // _delegatedBalances[_owner][_account] += _amount;
    _delegatedBalances[_owner][_account] = _delegatedBalances[_owner][_account].add(_amount);

    if (_account != _owner) {
      _delegations[_owner].addSilent(_account);
      _delegatedBy[_account].addSilent(_owner);
    }
  }

  function _debitAccount(address _account, address _owner, uint256 _amount) internal {
    require(_balances[_account] >= _amount, "LiquidRA: Not enough funds");
    require(_delegatedBalances[_owner][_account] >= _amount, "LiquidRA: Not enough funds");

    // _balances[_account] -= _amount;
    _balances[_account] = _balances[_account].sub(_amount);
    // _delegatedBalances[_owner][_account] -= _amount;
    _delegatedBalances[_owner][_account] = _delegatedBalances[_owner][_account].sub(_amount);

    if (_delegatedBalances[_owner][_account] == 0) {
      if (_account != _owner) {
        _delegations[_owner].remove(_account);
        _delegatedBy[_account].remove(_owner);
      }
    }
  }

  function _revokeDelegated(address _account, uint _amount) internal {
    _debitAccount(_account, msg.sender, _amount);
    _creditAccount(msg.sender, msg.sender, _amount);

    emit RevokeDelegated(_account, msg.sender, _amount);
    emit Transfer(_account, msg.sender, _amount);
  }

  // GETTERS

  // ERC20 compatible
  function balanceOf(address _owner) public view returns (uint256) {
    return _balances[_owner];
  }

  function ownedBalanceOf(address _owner) public view returns (uint256) {
    return _ownedBalances[_owner];
  }

  function delegatedBalanceOf(address _delegate, address _owner) public view returns (uint256) {
    return _delegatedBalances[_owner][_delegate];
  }

  function delegations(address _owner) public view returns (address[] memory) {
    return _delegations[_owner].elements();
  }

  function delegationCount(address _owner) public view returns (uint256) {
    return _delegations[_owner].size();
  }

  function delegatedBy(address _account) public view returns (address[] memory) {
    return _delegatedBy[_account].elements();
  }

  function delegatedByCount(address _account) public view returns (uint256) {
    return _delegatedBy[_account].size();
  }

  // ERC20 compatible
  function totalSupply() public view returns (uint256) {
    return totalStakedSpace;
  }

  // Ping-Pong Handshake
  function ping() public pure returns (bytes32) {
    return bytes32("pong");
  }
}
