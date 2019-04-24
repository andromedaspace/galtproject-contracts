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

import "openzeppelin-solidity/contracts/token/ERC721/ERC721Full.sol";
import "@galtproject/libs/contracts/traits/Permissionable.sol";
import "./interfaces/ISpaceToken.sol";

/*
 * SpaceToken contract
 */
contract SpaceToken is ISpaceToken, ERC721Full, Permissionable {
  string public constant ROLE_MINTER = "minter";
  string public constant ROLE_BURNER = "burner";

  event NewSpaceToken(uint256 tokenId, address owner);

  uint256 packTokenIdCounter;

  modifier onlyMinter() {
    require(hasRole(msg.sender, ROLE_MINTER), "Only minter allowed");
    _;
  }

  modifier onlyBurner() {
    require(hasRole(msg.sender, ROLE_BURNER), "Only burner allowed");
    _;
  }

  modifier onlyOwnerOf(uint256 _tokenId) {
    require(ownerOf(_tokenId) == msg.sender, "Only owner of Space token");
    _;
  }

  constructor(
    string memory name,
    string memory symbol
  )
    public
    ERC721Full(name, symbol)
  {
  }

  // MODIFIERS

  function mint(
    address _to
  )
    external
    onlyMinter
    returns (uint256)
  {
    uint256 _tokenId = _generateTokenId();
    super._mint(_to, _tokenId);

    emit NewSpaceToken(_tokenId, _to);

    return _tokenId;
  }

  function burn(uint256 _tokenId) external {
    require(ownerOf(_tokenId) == msg.sender || hasRole(msg.sender, ROLE_BURNER), "Either owner or burner role allowed");

    super._burn(ownerOf(_tokenId), _tokenId);
  }

  function setTokenURI(
    uint256 _tokenId,
    string calldata _uri
  )
    external
    onlyOwnerOf(_tokenId)
  {
    super._setTokenURI(_tokenId, _uri);
  }

  function tokensOfOwner(address _owner) external view returns (uint256[] memory) {
    return _tokensOfOwner(_owner);
  }

  function _generateTokenId() internal returns (uint256) {
    return packTokenIdCounter++;
  }

  // GETTERS

  function exists(uint256 _tokenId) external view returns (bool) {
    return _exists(_tokenId);
  }

}
