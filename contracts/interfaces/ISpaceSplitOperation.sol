/*
 * Copyright ©️ 2018 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

pragma solidity 0.5.10;


contract ISpaceSplitOperation {

  address public subjectTokenOwner;
  uint256 public subjectTokenId;
  uint256[] public subjectContour;
  uint256[] public clippingContour;

  uint256[] public subjectContourOutput;
  uint256[][] public resultContours;

  function getSubjectContour() external view returns (uint256[] memory);

  function getClippingContour() external view returns (uint256[] memory);

  function init() external;

  function getResultContour(uint256 contourIndex) external view returns (uint256[] memory);

  function getFinishInfo() external view returns (uint256[] memory subjectContourResult, address tokenOwner, uint256 resultContoursCount);
}
