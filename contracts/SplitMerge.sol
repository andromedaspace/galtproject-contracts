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

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "@galtproject/geodesic/contracts/interfaces/IGeodesic.sol";
import "@galtproject/geodesic/contracts/utils/GeohashUtils.sol";
import "@galtproject/libs/contracts/traits/Initializable.sol";
import "@galtproject/libs/contracts/traits/Permissionable.sol";
import "./interfaces/ISpaceSplitOperationFactory.sol";
import "./interfaces/ISpaceSplitOperation.sol";
import "./SpaceToken.sol";
import "./SplitMergeLib.sol";
import "./interfaces/ISplitMerge.sol";

contract SplitMerge is Initializable, ISplitMerge, Ownable, Permissionable {
  using SafeMath for uint256;

  // TODO: set MIN_CONTOUR_GEOHASH_PRECISION 12
  uint8 public constant MIN_CONTOUR_GEOHASH_PRECISION = 1;
  uint8 public constant MAX_CONTOUR_GEOHASH_COUNT = 100;

  string public constant GEO_DATA_MANAGER = "geo_data_manager";

  SpaceToken public spaceToken;
  IGeodesic public geodesic;
  ISpaceSplitOperationFactory public splitOperationFactory;

  event PackageInit(bytes32 id, address owner);
  event SpaceTokenHeightsChange(bytes32 id, int256[] heights);
  event SpaceTokenContourChange(bytes32 id, uint256[] contour);
  event SpaceTokenLevelChange(bytes32 id, int256 level);
  event SpaceTokenAreaChange(bytes32 id, uint256 area);
  event SplitOperationStart(uint256 spaceTokenId, address splitOperation);
  event NewSplitSpaceToken(uint256 id);

  mapping(uint256 => uint256[]) public packageToContour;
  mapping(uint256 => int256[]) public packageToHeights;
  mapping(uint256 => int256) public packageToLevel;

  mapping(uint256 => uint256) public tokenArea;
  mapping(uint256 => AreaSource) public tokenAreaSource;

  mapping(address => bool) public activeSplitOperations;
  mapping(uint256 => address[]) public tokenIdToSplitOperations;
  address[] public allSplitOperations;

  struct TokenInfo {
    bytes32 ledgerIdentifier;
    string description;
  }

  mapping(uint256 => TokenInfo) public tokenInfo;
  
  function initialize(SpaceToken _spaceToken) public isInitializer {
    spaceToken = _spaceToken;
  }

  function setSplitOperationFactory(address _splitOperationFactory) external onlyOwner {
    splitOperationFactory = ISpaceSplitOperationFactory(_splitOperationFactory);
  }

  function setGeodesic(address _geodesic) external onlyOwner {
    geodesic = IGeodesic(_geodesic);
  }

  modifier onlySpaceTokenOwner(uint256 _spaceTokenId) {
    address ownerOfToken = spaceToken.ownerOf(_spaceTokenId);

    require(
    /* solium-disable-next-line */
      ownerOfToken == msg.sender ||
      spaceToken.isApprovedForAll(ownerOfToken, msg.sender) ||
      spaceToken.getApproved(_spaceTokenId) == msg.sender,
      "This action not permitted");
    _;
  }

  modifier onlyGeoDataManager() {
    require(
    /* solium-disable-next-line */
      hasRole(msg.sender, GEO_DATA_MANAGER),
      "This action not permitted");
    _;
  }

  function initPackage(address spaceTokenOwner)
    public onlyGeoDataManager()
    returns (uint256)
  {
    uint256 _packageTokenId = spaceToken.mint(spaceTokenOwner);

    emit PackageInit(bytes32(_packageTokenId), spaceTokenOwner);

    return _packageTokenId;
  }

  function setPackageContour(uint256 _spaceTokenId, uint256[] memory _geohashesContour)
    public onlyGeoDataManager()
  {
    require(_geohashesContour.length >= 3, "Number of contour elements should be equal or greater than 3");
    require(
      _geohashesContour.length <= MAX_CONTOUR_GEOHASH_COUNT,
      "Number of contour elements should be equal or less than MAX_CONTOUR_GEOHASH_COUNT"
    );

    for (uint8 i = 0; i < _geohashesContour.length; i++) {
      require(_geohashesContour[i] > 0, "Contour element geohash should not be a zero");
      require(
        GeohashUtils.geohash5Precision(_geohashesContour[i]) >= MIN_CONTOUR_GEOHASH_PRECISION,
        "Contour element geohash should have at least MIN_CONTOUR_GEOHASH_PRECISION precision"
      );
    }

    packageToContour[_spaceTokenId] = _geohashesContour;
    emit SpaceTokenContourChange(bytes32(_spaceTokenId), _geohashesContour);
  }

  function setPackageHeights(uint256 _spaceTokenId, int256[] memory _heightsList)
    public onlyGeoDataManager()
  {
    require(_heightsList.length == getPackageContour(_spaceTokenId).length, "Number of height elements should be equal contour length");

    packageToHeights[_spaceTokenId] = _heightsList;
    emit SpaceTokenHeightsChange(bytes32(_spaceTokenId), _heightsList);
  }

  function setPackageLevel(uint256 _spaceTokenId, int256 _level)
    public onlyGeoDataManager()
  {
    packageToLevel[_spaceTokenId] = _level;
    emit SpaceTokenLevelChange(bytes32(_spaceTokenId), _level);
  }

  // TODO: add SpaceSplitOperationFactory for migrations between versions
  function startSplitOperation(uint256 _spaceTokenId, uint256[] calldata _clippingContour)
    external
    onlySpaceTokenOwner(_spaceTokenId)
    returns (address)
  {
    require(tokenAreaSource[_spaceTokenId] == AreaSource.CONTRACT, "Split available only for contract calculated token's area");
    
    address spaceTokenOwner = spaceToken.ownerOf(_spaceTokenId);

    address newSplitOperationAddress = splitOperationFactory.build(_spaceTokenId, _clippingContour);
    activeSplitOperations[newSplitOperationAddress] = true;
    tokenIdToSplitOperations[_spaceTokenId].push(newSplitOperationAddress);
    allSplitOperations.push(newSplitOperationAddress);

    spaceToken.transferFrom(spaceTokenOwner, newSplitOperationAddress, _spaceTokenId);
    ISpaceSplitOperation(newSplitOperationAddress).init();

    emit SplitOperationStart(_spaceTokenId, newSplitOperationAddress);
    return newSplitOperationAddress;
  }

  function getCurrentSplitOperation(uint256 _spaceTokenId) external returns (address) {
    return tokenIdToSplitOperations[_spaceTokenId][tokenIdToSplitOperations[_spaceTokenId].length - 1];
  }

  function getSplitOperationsCount(uint256 _spaceTokenId) external returns (uint256) {
    return tokenIdToSplitOperations[_spaceTokenId].length;
  }

  function finishSplitOperation(uint256 _spaceTokenId) external {
    require(tokenIdToSplitOperations[_spaceTokenId].length > 0, "Split operations for this token not exists");
    address splitOperationAddress = tokenIdToSplitOperations[_spaceTokenId][tokenIdToSplitOperations[_spaceTokenId].length - 1];
    require(activeSplitOperations[splitOperationAddress], "Method should be called for active SpaceSplitOperation contract");
    ISpaceSplitOperation splitOperation = ISpaceSplitOperation(splitOperationAddress);

    (uint256[] memory subjectContourOutput, address subjectTokenOwner, uint256 resultContoursLength) = splitOperation.getFinishInfo();

    packageToContour[_spaceTokenId] = subjectContourOutput;
    emit SpaceTokenContourChange(bytes32(_spaceTokenId), subjectContourOutput);

    int256 minHeight = packageToHeights[_spaceTokenId][0];

    int256[] memory subjectPackageHeights = new int256[](packageToContour[_spaceTokenId].length);
    for (uint i = 0; i < packageToContour[_spaceTokenId].length; i++) {
      if (i + 1 > packageToHeights[_spaceTokenId].length) {
        subjectPackageHeights[i] = minHeight;
      } else {
        if (packageToHeights[_spaceTokenId][i] < minHeight) {
          minHeight = packageToHeights[_spaceTokenId][i];
        }
        subjectPackageHeights[i] = packageToHeights[_spaceTokenId][i];
      }
    }

    packageToHeights[_spaceTokenId] = subjectPackageHeights;
    emit SpaceTokenHeightsChange(bytes32(_spaceTokenId), subjectPackageHeights);

    spaceToken.transferFrom(splitOperationAddress, subjectTokenOwner, _spaceTokenId);

    for (uint j = 0; j < resultContoursLength; j++) {
      uint256 newPackageId = spaceToken.mint(subjectTokenOwner);
      
      packageToContour[newPackageId] = splitOperation.getResultContour(j);
      emit SpaceTokenContourChange(bytes32(newPackageId), packageToContour[newPackageId]);

      tokenArea[newPackageId] = calculateTokenArea(newPackageId);
      emit SpaceTokenAreaChange(bytes32(newPackageId), tokenArea[newPackageId]);
      tokenAreaSource[newPackageId] = AreaSource.CONTRACT;

      for (uint k = 0; k < packageToContour[newPackageId].length; k++) {
        packageToHeights[newPackageId].push(minHeight);
      }
      emit SpaceTokenHeightsChange(bytes32(newPackageId), packageToHeights[newPackageId]);
      
      packageToLevel[newPackageId] = getPackageLevel(_spaceTokenId);
      emit SpaceTokenLevelChange(bytes32(newPackageId), packageToLevel[newPackageId]);
      
      emit NewSplitSpaceToken(newPackageId);
    }

    tokenArea[_spaceTokenId] = calculateTokenArea(_spaceTokenId);
    tokenAreaSource[_spaceTokenId] = AreaSource.CONTRACT;
    emit SpaceTokenAreaChange(bytes32(_spaceTokenId), tokenArea[_spaceTokenId]);

    activeSplitOperations[splitOperationAddress] = false;
  }

  function cancelSplitPackage(uint256 _spaceTokenId) external {
    address splitOperationAddress = tokenIdToSplitOperations[_spaceTokenId][tokenIdToSplitOperations[_spaceTokenId].length - 1];
    require(activeSplitOperations[splitOperationAddress], "Method should be called from active SpaceSplitOperation contract");
    require(tokenIdToSplitOperations[_spaceTokenId].length > 0, "Split operations for this token not exists");

    ISpaceSplitOperation splitOperation = ISpaceSplitOperation(splitOperationAddress);
    require(splitOperation.subjectTokenOwner() == msg.sender, "This action not permitted");
    spaceToken.transferFrom(splitOperationAddress, splitOperation.subjectTokenOwner(), _spaceTokenId);
    activeSplitOperations[splitOperationAddress] = false;
  }

  function mergePackage(
    uint256 _sourceSpaceTokenId,
    uint256 _destinationSpaceTokenId,
    uint256[] calldata _destinationSpaceContour
  )
    external
    onlySpaceTokenOwner(_sourceSpaceTokenId)
    onlySpaceTokenOwner(_destinationSpaceTokenId)
  {
    require(tokenAreaSource[_sourceSpaceTokenId] == AreaSource.CONTRACT, "Merge available only for contract calculated token's area");
    require(tokenAreaSource[_destinationSpaceTokenId] == AreaSource.CONTRACT, "Merge available only for contract calculated token's area");
    require(
      getPackageLevel(_sourceSpaceTokenId) == getPackageLevel(_destinationSpaceTokenId),
      "Space tokens levels should be equal"
    );
    SplitMergeLib.checkMergeContours(
      getPackageContour(_sourceSpaceTokenId),
      getPackageContour(_destinationSpaceTokenId),
      _destinationSpaceContour
    );

    packageToContour[_destinationSpaceTokenId] = _destinationSpaceContour;
    emit SpaceTokenContourChange(bytes32(_destinationSpaceTokenId), _destinationSpaceContour);

    int256[] memory sourcePackageHeights = getPackageHeights(_sourceSpaceTokenId);

    int256[] memory packageHeights = new int256[](_destinationSpaceContour.length);
    for (uint i = 0; i < _destinationSpaceContour.length; i++) {
      if (i + 1 > sourcePackageHeights.length) {
        packageHeights[i] = packageToHeights[_destinationSpaceTokenId][i - sourcePackageHeights.length];
      } else {
        packageHeights[i] = sourcePackageHeights[i];
      }
    }
    packageToHeights[_destinationSpaceTokenId] = packageHeights;
    emit SpaceTokenHeightsChange(bytes32(_destinationSpaceTokenId), packageToHeights[_destinationSpaceTokenId]);

    tokenArea[_destinationSpaceTokenId] = calculateTokenArea(_destinationSpaceTokenId);
    emit SpaceTokenAreaChange(bytes32(_destinationSpaceTokenId), tokenArea[_destinationSpaceTokenId]);
    tokenAreaSource[_destinationSpaceTokenId] = AreaSource.CONTRACT;
    
    delete packageToContour[_sourceSpaceTokenId];
    emit SpaceTokenContourChange(bytes32(_sourceSpaceTokenId), packageToContour[_sourceSpaceTokenId]);
    
    delete packageToHeights[_sourceSpaceTokenId];
    emit SpaceTokenHeightsChange(bytes32(_sourceSpaceTokenId), packageToHeights[_sourceSpaceTokenId]);

    delete packageToLevel[_sourceSpaceTokenId];
    emit SpaceTokenLevelChange(bytes32(_sourceSpaceTokenId), packageToLevel[_sourceSpaceTokenId]);

    tokenArea[_sourceSpaceTokenId] = 0;
    emit SpaceTokenAreaChange(bytes32(_sourceSpaceTokenId), tokenArea[_sourceSpaceTokenId]);
    tokenAreaSource[_sourceSpaceTokenId] = AreaSource.CONTRACT;
    
    spaceToken.burn(_sourceSpaceTokenId);
  }

  function checkMergeContours(
    uint256[] memory sourceContour,
    uint256[] memory mergeContour,
    uint256[] memory resultContour
  )
    public
  {
    SplitMergeLib.checkMergeContours(sourceContour, mergeContour, resultContour);
  }

  function getPackageContour(uint256 _spaceTokenId) public view returns (uint256[] memory) {
    return packageToContour[_spaceTokenId];
  }

  function getPackageHeights(uint256 _spaceTokenId) public view returns (int256[] memory) {
    return packageToHeights[_spaceTokenId];
  }

  function getPackageLevel(uint256 _spaceTokenId) public view returns (int256) {
    return packageToLevel[_spaceTokenId];
  }
  
  function calculateTokenArea(uint256 _spaceTokenId) public returns (uint256) {
    return geodesic.calculateContourArea(packageToContour[_spaceTokenId]);
  }

  function setTokenArea(uint256 _spaceTokenId, uint256 _area, AreaSource _areaSource) external onlyGeoDataManager {
    tokenArea[_spaceTokenId] = _area;
    tokenAreaSource[_spaceTokenId] = _areaSource;
    emit SpaceTokenAreaChange(bytes32(_spaceTokenId), _area);
  }

  function getContourArea(uint256 _spaceTokenId) external view returns (uint256) {
    return tokenArea[_spaceTokenId];
  }
  
  function getGeodesic() external view returns (address) {
    return address(geodesic);
  }

  function setTokenInfo(uint256 _spaceTokenId, bytes32 _ledgerIdentifier, string calldata _description) external onlyGeoDataManager {
    TokenInfo storage ti = tokenInfo[_spaceTokenId];
    ti.ledgerIdentifier = _ledgerIdentifier;
    ti.description = _description;
  }

  function getPackageGeoData(uint256 _spaceTokenId) public view returns (
    uint256[] memory contour,
    int256[] memory heights,
    int256 level,
    uint256 area,
    AreaSource areaSource,
    bytes32 ledgerIdentifier,
    string memory description
  )
  {
    TokenInfo storage ti = tokenInfo[_spaceTokenId];
    return (
      packageToContour[_spaceTokenId],
      packageToHeights[_spaceTokenId],
      packageToLevel[_spaceTokenId],
      tokenArea[_spaceTokenId],
      tokenAreaSource[_spaceTokenId],
      ti.ledgerIdentifier,
      ti.description
    );
  }
}
