pragma solidity 0.4.24;
pragma experimental "v0.5.0";
//pragma experimental ABIEncoderV2;

import "../utils/WeilerAtherton.sol";
import "../utils/PolygonUtils.sol";

contract MockWeilerAtherton {
  using WeilerAtherton for WeilerAtherton.State;

  WeilerAtherton.State private weilerAtherton;
  PolygonUtils.CoorsPolygon private basePolygon;
  PolygonUtils.CoorsPolygon private cropPolygon;
  
  constructor() public {
    weilerAtherton.init();
  }
  
  function addPointToBasePolygon(int256[2] point) public {
    basePolygon.points.push(point);
  }

  function addPointToCropPolygon(int256[2] point) public {
    cropPolygon.points.push(point);
  }
  
  function initBasePolygon() public {
    weilerAtherton.basePolygonInput = basePolygon;
    weilerAtherton.initPolygon(basePolygon, weilerAtherton.basePolygon);
  }

  function initCropPolygon() public {
    weilerAtherton.cropPolygonInput = cropPolygon;
    weilerAtherton.initPolygon(cropPolygon, weilerAtherton.cropPolygon);
  }

  function addBasePolygonSegments() public {
    weilerAtherton.addPolygonSegments(weilerAtherton.basePolygon);
  }

  function addCropPolygonSegments() public {
    weilerAtherton.addPolygonSegments(weilerAtherton.cropPolygon);
  }
  
  function processBentleyOttman() public {
    weilerAtherton.processBentleyOttman();
  }

  function isBentleyOttmanFinished() public returns(bool) {
    return weilerAtherton.isBentleyOttmanFinished();
  }
  
  function addIntersectedPoints() public {
    weilerAtherton.addIntersectedPoints();
  }

  function buildResultPolygon() public {
    weilerAtherton.buildResultPolygon();
  }
}
