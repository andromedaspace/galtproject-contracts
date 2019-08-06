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

pragma solidity ^0.5.10;

import "../applications/interfaces/IContourModifierApplication.sol";
import "@galtproject/libs/contracts/collections/ArraySet.sol";
import "../registries/GaltGlobalRegistry.sol";
import "./MockAddContourApplication.sol";


contract MockUpdateContourApplication is MockAddContourApplication {
  mapping(bytes32 => uint256) public applicationIdToSpaceTokenId;

  constructor(GaltGlobalRegistry _ggr) public MockAddContourApplication(_ggr) {}

  function submit(uint256 _spaceTokenId, uint256[] calldata _contour) external returns (bytes32) {
    bytes32 applicationId = MockAddContourApplication.submit(_contour);
    applicationIdToSpaceTokenId[applicationId] = _spaceTokenId;
    return applicationId;
  }

  function submit(uint256[] memory _contour) public returns (bytes32) {
    revert("Specify token ID as a first argument");
  }

  function getCVData(
    bytes32 _applicationId
  )
    external
    view
    returns (
      IContourModifierApplication.ContourModificationType contourModificationType,
      uint256 spaceTokenId,
      uint256[] memory contourToAdd,
      uint256[] memory contourToRemove
    )
  {
    contourModificationType = IContourModifierApplication.ContourModificationType.UPDATE;
    spaceTokenId = applicationIdToSpaceTokenId[_applicationId];
    contourToAdd = applications[_applicationId].contour;
    contourToRemove = applications[_applicationId].contour;
  }
}
