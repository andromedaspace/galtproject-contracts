pragma solidity 0.5.7;

import "../SpaceGeoData.sol";
import "../interfaces/ISpaceToken.sol";


contract SpaceGeoDataSandbox is SpaceGeoData {

  constructor() public {}

  function initPackage(address spaceTokenOwner) public returns (uint256) {
    uint256 _packageTokenId = ISpaceToken(ggr.getSpaceTokenAddress()).mint(spaceTokenOwner);

    emit PackageInit(bytes32(_packageTokenId), spaceTokenOwner);

    return _packageTokenId;
  }

  function setPackageContour(uint256 _spaceTokenId, uint256[] memory _geohashesContour) public {
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

  function setPackageHeights(uint256 _packageTokenId, int256[] memory _heightsList) public {
    require(_heightsList.length == getPackageContour(_packageTokenId).length, "Number of height elements should be equal contour length");

    packageToHeights[_packageTokenId] = _heightsList;
    emit SpaceTokenHeightsChange(bytes32(_packageTokenId), _heightsList);
  }

  function setTokenArea(uint256 _spaceTokenId, uint256 _area, AreaSource _areaSource) public {
    tokenArea[_spaceTokenId] = _area;
    tokenAreaSource[_spaceTokenId] = _areaSource;
    emit SpaceTokenAreaChange(bytes32(_spaceTokenId), _area);
  }

  function createPackage(address spaceTokenOwner, uint256[] memory _geohashesContour, int256[] memory _heightsList, uint256 _area, AreaSource _areaSource) public returns (uint256) {
    uint256 _spaceTokenId = initPackage(spaceTokenOwner);
    setPackageContour(_spaceTokenId, _geohashesContour);
    setPackageHeights(_spaceTokenId, _heightsList);
    setTokenArea(_spaceTokenId, _area, _areaSource);
    return _spaceTokenId;
  }
}
