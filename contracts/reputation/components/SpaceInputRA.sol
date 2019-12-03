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
import "@galtproject/libs/contracts/collections/ArraySet.sol";
import "../../registries/interfaces/ILockerRegistry.sol";
import "../../interfaces/ISpaceLocker.sol";
import "./LiquidRA.sol";
import "./DecentralizedRA.sol";

// LiquidRA - base class
// SpaceInputRA - space input
// GaltInputRA - galt input
// LockableRA - lockable output
// SharableRA - share calculation output
// FundRA - LiquidRA + SpaceInputRA + SharableRA


contract SpaceInputRA is LiquidRA, DecentralizedRA {
  ArraySet.AddressSet internal _spaceTokenOwners;

  mapping(address => ArraySet.Uint256Set) internal _spaceTokensByOwner;

  mapping(uint256 => bool) public reputationMinted;

  modifier onlySpaceTokenOwner(uint256 _spaceTokenId, ISpaceLocker _spaceLocker) {
    require(address(_spaceLocker) == ggr.getSpaceToken().ownerOf(_spaceTokenId), "Invalid sender. Token owner expected.");
    require(msg.sender == _spaceLocker.owner(), "Not SpaceLocker owner");
    spaceLockerRegistry().requireValidLocker(address(_spaceLocker));
    _;
  }

  // @dev Transfer owned reputation
  // PermissionED
  function delegate(address _to, address _owner, uint256 _amount) public {
    require(_spaceTokenOwners.has(_to), "Beneficiary isn't a space token owner");

    _transfer(msg.sender, _to, _owner, _amount);
  }

  // @dev Mints reputation for given token to the owner account
  function mint(
    ISpaceLocker _spaceLocker
  )
    public
  {
    spaceLockerRegistry().requireValidLocker(address(_spaceLocker));

    address owner = _spaceLocker.owner();
    require(msg.sender == owner, "Not owner of the locker");

    uint256 spaceTokenId = _spaceLocker.spaceTokenId();
    require(reputationMinted[spaceTokenId] == false, "Reputation already minted");

    uint256 reputation = _spaceLocker.reputation();

    _cacheSpaceTokenOwner(owner, spaceTokenId);
    _mint(owner, reputation);
  }

  // Burn space token total reputation
  // Owner should revoke all delegated reputation back to his account before performing this action
  function approveBurn(
    ISpaceLocker _spaceLocker
  )
    public
  {
    spaceLockerRegistry().requireValidLocker(address(_spaceLocker));

    address owner = _spaceLocker.owner();

    require(msg.sender == owner, "Not owner of the locker");

    uint256 reputation = _spaceLocker.reputation();

    uint256 spaceTokenId = _spaceLocker.spaceTokenId();

    require(reputationMinted[spaceTokenId] == true, "Reputation doesn't minted");

    _burn(owner, reputation);

    _spaceTokensByOwner[owner].remove(spaceTokenId);
    if (_spaceTokensByOwner[owner].size() == 0) {
      _spaceTokenOwners.remove(owner);
    }

    reputationMinted[spaceTokenId] = false;
  }

  function _cacheSpaceTokenOwner(address _owner, uint256 _spaceTokenId) internal {
    _spaceTokensByOwner[_owner].add(_spaceTokenId);
    _spaceTokenOwners.addSilent(_owner);
    reputationMinted[_spaceTokenId] = true;
  }

  function spaceLockerRegistry() internal view returns(ILockerRegistry) {
    return ILockerRegistry(ggr.getSpaceLockerRegistryAddress());
  }

  function spaceTokenOwners() public view returns (address[] memory) {
    return _spaceTokenOwners.elements();
  }

  function spaceTokenOwnersCount() public view returns (uint256) {
    return _spaceTokenOwners.size();
  }

  function isMember(address _owner) public view returns (bool) {
    return _spaceTokenOwners.has(_owner);
  }

  function ownerHasSpaceToken(address _owner, uint256 _spaceTokenId) public view returns (bool) {
    return _spaceTokensByOwner[_owner].has(_spaceTokenId);
  }

  function spaceTokensByOwner(address _owner) public view returns (uint256[] memory) {
    return _spaceTokensByOwner[_owner].elements();
  }

  function spaceTokensByOwnerCount(address _owner) public view returns (uint256) {
    return _spaceTokensByOwner[_owner].size();
  }
}
