/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity ^0.5.13;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/drafts/Counters.sol";
import "@galtproject/libs/contracts/traits/OwnableAndInitializable.sol";
import "@galtproject/libs/contracts/utils/ArrayUtils.sol";
import "./interfaces/ISpaceSplitOperation.sol";
import "./interfaces/ISpaceSplitOperationFactory.sol";
import "./factories/SpaceSplitOperationFactory.sol";
import "./interfaces/ISpaceToken.sol";
import "./registries/SpaceGeoDataRegistry.sol";
import "./registries/GaltGlobalRegistry.sol";


contract SplitMerge is OwnableAndInitializable {
  event SplitOperationStart(uint256 indexed spaceTokenId, address splitOperation);
  event NewSplitSpaceToken(uint256 id);

  GaltGlobalRegistry internal ggr;

  mapping(address => bool) public activeSplitOperations;
  mapping(uint256 => address[]) public tokenIdToSplitOperations;
  address[] public allSplitOperations;

  modifier onlySpaceTokenOwner(uint256 _spaceTokenId) {
    address ownerOfToken = spaceToken().ownerOf(_spaceTokenId);

    require(
    /* solium-disable-next-line */
      ownerOfToken == msg.sender ||
      spaceToken().isApprovedForAll(ownerOfToken, msg.sender) ||
      spaceToken().getApproved(_spaceTokenId) == msg.sender,
      "This action not permitted");
    _;
  }

  function initialize(GaltGlobalRegistry _ggr) public isInitializer {
    ggr = _ggr;
  }

   // TODO: add SpaceSplitOperationFactory for migrations between versions
  function startSplitOperation(uint256 _spaceTokenId, uint256[] calldata _clippingContour)
    external
    onlySpaceTokenOwner(_spaceTokenId)
    returns (address)
  {
    SpaceGeoDataRegistry _reg = SpaceGeoDataRegistry(ggr.getSpaceGeoDataRegistryAddress());

    require(
      _reg.getAreaSource(_spaceTokenId) == ISpaceGeoDataRegistry.AreaSource.CONTRACT,
      "Split available only for contract calculated token's area"
    );

    address spaceTokenOwner = spaceToken().ownerOf(_spaceTokenId);

    address newSplitOperationAddress = SpaceSplitOperationFactory(ggr.getSpaceSplitOperationFactoryAddress())
      .build(_spaceTokenId, _clippingContour);

    activeSplitOperations[newSplitOperationAddress] = true;
    tokenIdToSplitOperations[_spaceTokenId].push(newSplitOperationAddress);
    allSplitOperations.push(newSplitOperationAddress);

    spaceToken().transferFrom(spaceTokenOwner, newSplitOperationAddress, _spaceTokenId);
    ISpaceSplitOperation(newSplitOperationAddress).init();

    emit SplitOperationStart(_spaceTokenId, newSplitOperationAddress);
    return newSplitOperationAddress;
  }

  function calculateTokenArea(uint256 _spaceTokenId) public returns (uint256) {
    SpaceGeoDataRegistry reg = SpaceGeoDataRegistry(ggr.getSpaceGeoDataRegistryAddress());
    return IGeodesic(ggr.getGeodesicAddress()).calculateContourArea(reg.getContour(_spaceTokenId));
  }

  function finishSplitOperation(uint256 _spaceTokenId) external {
    require(tokenIdToSplitOperations[_spaceTokenId].length > 0, "Split operations for this token not exists");
    address splitOperationAddress = tokenIdToSplitOperations[_spaceTokenId][tokenIdToSplitOperations[_spaceTokenId].length - 1];
    require(activeSplitOperations[splitOperationAddress], "Method should be called for active SpaceSplitOperation contract");

    ISpaceSplitOperation splitOperation = ISpaceSplitOperation(splitOperationAddress);
    SpaceGeoDataRegistry reg = SpaceGeoDataRegistry(ggr.getSpaceGeoDataRegistryAddress());

    (uint256[] memory subjectContourOutput, address subjectTokenOwner, uint256 resultContoursLength) = splitOperation.getFinishInfo();

    reg.setContour(_spaceTokenId, subjectContourOutput);

    spaceToken().transferFrom(splitOperationAddress, subjectTokenOwner, _spaceTokenId);
    int256 originalHighestPoint = reg.getHighestPoint(_spaceTokenId);

    for (uint256 j = 0; j < resultContoursLength; j++) {
      uint256 newPackageId = spaceToken().mint(subjectTokenOwner);

      reg.setContour(newPackageId, splitOperation.getResultContour(j));
      reg.setArea(newPackageId, calculateTokenArea(newPackageId), ISpaceGeoDataRegistry.AreaSource.CONTRACT);
      reg.setHighestPoint(newPackageId, originalHighestPoint);

      emit NewSplitSpaceToken(newPackageId);
    }

    reg.setArea(_spaceTokenId, calculateTokenArea(_spaceTokenId), ISpaceGeoDataRegistry.AreaSource.CONTRACT);

    activeSplitOperations[splitOperationAddress] = false;
  }

  function cancelSplitPackage(uint256 _spaceTokenId) external {
    address splitOperationAddress = tokenIdToSplitOperations[_spaceTokenId][tokenIdToSplitOperations[_spaceTokenId].length - 1];
    require(activeSplitOperations[splitOperationAddress], "Method should be called from active SpaceSplitOperation contract");
    require(tokenIdToSplitOperations[_spaceTokenId].length > 0, "Split operations for this token not exists");

    ISpaceSplitOperation splitOperation = ISpaceSplitOperation(splitOperationAddress);
    require(splitOperation.subjectTokenOwner() == msg.sender, "This action not permitted");
    spaceToken().transferFrom(splitOperationAddress, splitOperation.subjectTokenOwner(), _spaceTokenId);
    activeSplitOperations[splitOperationAddress] = false;
  }

  function mergeSpaceToken(
    uint256 _sourceSpaceTokenId,
    uint256 _destinationSpaceTokenId,
    uint256[] calldata _destinationSpaceContour
  )
    external
    onlySpaceTokenOwner(_sourceSpaceTokenId)
    onlySpaceTokenOwner(_destinationSpaceTokenId)
  {
    SpaceGeoDataRegistry reg = SpaceGeoDataRegistry(ggr.getSpaceGeoDataRegistryAddress());
    require(
      reg.getAreaSource(_sourceSpaceTokenId) == ISpaceGeoDataRegistry.AreaSource.CONTRACT,
      "Merge available only for contract calculated token's area"
    );
    require(
      reg.getAreaSource(_destinationSpaceTokenId) == ISpaceGeoDataRegistry.AreaSource.CONTRACT,
      "Merge available only for contract calculated token's area"
    );
    checkMergeContours(
      reg.getContour(_sourceSpaceTokenId),
      reg.getContour(_destinationSpaceTokenId),
      _destinationSpaceContour
    );

    reg.setContour(_destinationSpaceTokenId, _destinationSpaceContour);

    int256 sourcePackageHighestPoint = reg.getHighestPoint(_sourceSpaceTokenId);
    reg.setHighestPoint(_destinationSpaceTokenId, sourcePackageHighestPoint);
    reg.setArea(
      _destinationSpaceTokenId,
      calculateTokenArea(_destinationSpaceTokenId),
      ISpaceGeoDataRegistry.AreaSource.CONTRACT
    );

    reg.deleteGeoData(_sourceSpaceTokenId);

    spaceToken().burn(_sourceSpaceTokenId);
  }

  function checkMergeContours(
    uint256[] memory sourceContour,
    uint256[] memory mergeContour,
    uint256[] memory resultContour
  )
    public
    pure
  {
    for (uint i = 0; i < sourceContour.length; i++) {
      for (uint j = 0; j < mergeContour.length; j++) {
        if (sourceContour[i] == mergeContour[j] && sourceContour[i] != 0) {
          sourceContour[i] = 0;
          mergeContour[j] = 0;
        }
      }
    }

    uint256[] memory checkResultContour = new uint256[](resultContour.length);
    for (uint i = 0; i < resultContour.length; i++) {
      checkResultContour[i] = resultContour[i];
    }

    for (uint i = 0; i < sourceContour.length + mergeContour.length; i++) {
      uint256 el = 0;
      if (i < sourceContour.length) {
        if (sourceContour[i] != 0) {
          el = sourceContour[i];
        }
      } else if (mergeContour[i - sourceContour.length] != 0) {
        el = mergeContour[i - sourceContour.length];
      }

      if (el != 0) {
        int index = ArrayUtils.uintFind(checkResultContour, el);
        require(index != - 1, "Unique element not exists in result contour");
        checkResultContour[uint(index)] = 0;
      }
    }
  }

  // GETTERS

  function getCurrentSplitOperation(uint256 _spaceTokenId) external view returns (address) {
    return tokenIdToSplitOperations[_spaceTokenId][tokenIdToSplitOperations[_spaceTokenId].length - 1];
  }

  function getSplitOperationsCount(uint256 _spaceTokenId) external view returns (uint256) {
    return tokenIdToSplitOperations[_spaceTokenId].length;
  }

  function spaceToken() internal view returns (ISpaceToken) {
    return ISpaceToken(ggr.getSpaceTokenAddress());
  }
}
