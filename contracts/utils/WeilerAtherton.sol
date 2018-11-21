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

pragma solidity 0.4.24;
pragma experimental "v0.5.0";

import "./BentleyOttman.sol";
import "./PolygonUtils.sol";
//import "./SegmentUtils.sol";
//import "./VectorUtils.sol";

library WeilerAtherton {
  using BentleyOttman for BentleyOttman.State;

  // TODO: use stages
  enum Stage {
    NONE,
    INIT,
    SEGMENTS_SET,
    QUEUE_INSERT
  }

  enum Direction {
    FORWARD,
    BACKWARD
  }

  //TODO: check for only unique points
  struct Point {
    bytes32 nextPoint;
    bytes32 prevPoint;
    int256[2] latLon;
    bool intersectionPoint;
    bool includedInResult;
  }

  struct Polygon {
    mapping(bytes32 => Point) pointsByHash;
    bytes32 startPoint;
    bytes32 currentPointForAddSegment;
    bytes32[] intersectionPoints;
    uint256 handledIntersectionPoints;
    bool segmentsAdded;
  }

  struct State {
    PolygonUtils.CoorsPolygon basePolygonInput;
    PolygonUtils.CoorsPolygon cropPolygonInput;
    Polygon basePolygon;
    Polygon cropPolygon;
    BentleyOttman.State bentleyOttman;
    PolygonUtils.CoorsPolygon[] resultPolygons;
    PolygonUtils.CoorsPolygon basePolygonOutput;
  }

  event LogBentleyOttman(uint256 queueInserted, uint256 queueRemoved, uint256 outputLength);
  event LogAddPoint(int256[2] point, bytes32 pointHash, bytes32 nextPointHash);
  event LogAddSegment(int256[2][2] segment);
  event LogPlacePointBetween(int256[2] placePoint, int256[2] startPoint, int256[2] endPoint);
  event LogPushToResult(int256[2] point);
  event LogSetNextPoint(int256[2] curPoint, bool isIntersection, int256[2] nextPoint);
  event LogIncludeIntersectionInResult(string polygon, int256[2] point, uint256 handledPoints);

  function initWeilerAtherton(State storage state) internal {
    state.bentleyOttman.initBentleyOttman();
  }

  function initAllPolygons(State storage state) public {
    initPolygon(state, state.basePolygonInput, state.basePolygon);
    initPolygon(state, state.cropPolygonInput, state.cropPolygon);
  }

  function initPolygon(State storage state, PolygonUtils.CoorsPolygon storage input, Polygon storage polygon) public {
    bytes32 pointHash;
    bytes32 prevPointHash;

    for (uint j = 0; j < input.points.length; j++) {
      pointHash = keccak256(abi.encode(input.points[j]));
      polygon.pointsByHash[pointHash].latLon = input.points[j];
      if (j == 0) {
        polygon.startPoint = pointHash;
      } else {
        polygon.pointsByHash[prevPointHash].nextPoint = pointHash;
        polygon.pointsByHash[pointHash].prevPoint = prevPointHash;
        //        emit LogAddPoint(polygon.pointsByHash[prevPointHash].latLon, prevPointHash, polygon.pointsByHash[prevPointHash].nextPoint);
      }
      prevPointHash = pointHash;
    }

    polygon.pointsByHash[pointHash].nextPoint = polygon.startPoint;
    polygon.pointsByHash[polygon.startPoint].prevPoint = pointHash;
  }

  function addPolygonSegments(State storage state, Polygon storage polygon) public {
    bytes32 currentPoint;
    if (polygon.currentPointForAddSegment == bytes32(0)) {
      currentPoint = polygon.startPoint;
    } else {
      currentPoint = polygon.currentPointForAddSegment;
    }

    //TODO: find max possible iterations count and break on it
    while (true) {
      state.bentleyOttman.addSegment([polygon.pointsByHash[currentPoint].latLon, polygon.pointsByHash[polygon.pointsByHash[currentPoint].nextPoint].latLon]);
      currentPoint = polygon.pointsByHash[currentPoint].nextPoint;
      //      emit LogAddSegment([polygon.pointsByHash[currentPoint].latLon, polygon.pointsByHash[polygon.pointsByHash[currentPoint].nextPoint].latLon]);
      if (currentPoint == polygon.startPoint) {
        polygon.segmentsAdded = true;
        break;
      }
    }
  }

  function processBentleyOttman(State storage state) public {
    state.bentleyOttman.handleQueuePoints();
    //    emit LogBentleyOttman(state.bentleyOttman.queue.tree.inserted, state.bentleyOttman.queue.tree.removed, state.bentleyOttman.output.length);
  }

  function isBentleyOttmanFinished(State storage state) public returns (bool) {
    return state.bentleyOttman.queue.tree.inserted == state.bentleyOttman.queue.tree.removed;
  }

  function addIntersectedPoints(State storage state) public {
    require(isBentleyOttmanFinished(state), "Bentley ottman not finished");

    bytes32 newPointHash;
    bytes32 leftStartPointHash;
    bytes32 leftEndPointHash;
    bytes32 rightStartPointHash;
    bytes32 rightEndPointHash;
    BentleyOttman.OutputPoint memory outputPoint;

    for (uint j = 0; j < state.bentleyOttman.output.length; j++) {
      outputPoint = state.bentleyOttman.output[j];

      if (outputPoint.leftSegment[0][0] == 0 || outputPoint.rightSegment[0][0] == 0) {
        continue;
      }

      /* solium-disable-next-line */
      if ((outputPoint.point[0] == outputPoint.leftSegment[0][0] && outputPoint.point[1] == outputPoint.leftSegment[0][1]) ||
          (outputPoint.point[0] == outputPoint.leftSegment[1][0] && outputPoint.point[1] == outputPoint.leftSegment[1][1]) ||
          (outputPoint.point[0] == outputPoint.rightSegment[0][0] && outputPoint.point[1] == outputPoint.rightSegment[0][1]) ||
          (outputPoint.point[0] == outputPoint.rightSegment[1][0] && outputPoint.point[1] == outputPoint.rightSegment[1][1])) {
        continue;
      }

      newPointHash = keccak256(abi.encode(outputPoint.point));
      leftStartPointHash = keccak256(abi.encode(outputPoint.leftSegment[0]));
      leftEndPointHash = keccak256(abi.encode(outputPoint.leftSegment[1]));
      rightStartPointHash = keccak256(abi.encode(outputPoint.rightSegment[0]));
      rightEndPointHash = keccak256(abi.encode(outputPoint.rightSegment[1]));


      if (addIntersectedPointsToPolygon(state.basePolygon, outputPoint.point, newPointHash, leftStartPointHash, leftEndPointHash)) {
        if (!addIntersectedPointsToPolygon(state.cropPolygon, outputPoint.point, newPointHash, rightStartPointHash, rightEndPointHash)) {
          require(false, "Intersected point of base polygon not found in crop polygon");
        }
      } else if (addIntersectedPointsToPolygon(state.basePolygon, outputPoint.point, newPointHash, rightStartPointHash, rightEndPointHash)) {
        if (!addIntersectedPointsToPolygon(state.cropPolygon, outputPoint.point, newPointHash, leftStartPointHash, leftEndPointHash)) {
          require(false, "Intersected point of base polygon not found in crop polygon");
        }
      } else {
        require(false, "Segments of intersection point not found in polygons");
      }
      //      emit LogPlacePointBetween(outputPoint.point, outputPoint.leftSegment[0], outputPoint.leftSegment[1]);
      //      emit LogPlacePointBetween(outputPoint.point, outputPoint.rightSegment[0], outputPoint.rightSegment[1]);
    }
  }

  function addIntersectedPointsToPolygon(Polygon storage polygon, int256[2] point, bytes32 pointHash, bytes32 findStartPointHash, bytes32 findEndPointHash) private returns (bool) {
    // is segment points exists in polygon
    if (polygon.pointsByHash[findStartPointHash].nextPoint != bytes32(0) || polygon.pointsByHash[findEndPointHash].nextPoint != bytes32(0)) {
      // write new point coors to polygon by hash
      polygon.pointsByHash[pointHash].latLon = point;
      polygon.pointsByHash[pointHash].intersectionPoint = true;
      polygon.intersectionPoints.push(pointHash);
      bytes32 pointToReplace;

      if (polygon.pointsByHash[findStartPointHash].nextPoint == findEndPointHash) {
        // is end point hash - next of start point hash
        // place point between findStartPointHash and findEndPointHash
        polygon.pointsByHash[findStartPointHash].nextPoint = pointHash;
        polygon.pointsByHash[findEndPointHash].prevPoint = pointHash;
        polygon.pointsByHash[pointHash].prevPoint = findStartPointHash;
        polygon.pointsByHash[pointHash].nextPoint = findEndPointHash;
        //        emit LogPlacePointBetween(pointHash, findStartPointHash, findEndPointHash);
      } else if (polygon.pointsByHash[findStartPointHash].prevPoint == findEndPointHash) {
        // is start point hash - next of end point hash(vice versa)
        // place point between findEndPointHash and findStartPointHash
        polygon.pointsByHash[findEndPointHash].nextPoint = pointHash;
        polygon.pointsByHash[findStartPointHash].prevPoint = pointHash;
        polygon.pointsByHash[pointHash].prevPoint = findEndPointHash;
        polygon.pointsByHash[pointHash].nextPoint = findStartPointHash;
        //        emit LogPlacePointBetween(pointHash, findEndPointHash, findStartPointHash);
      } else if (polygon.pointsByHash[polygon.pointsByHash[findStartPointHash].nextPoint].intersectionPoint && 
        SegmentUtils.pointOnSegment(point, polygon.pointsByHash[findStartPointHash].latLon, polygon.pointsByHash[polygon.pointsByHash[findStartPointHash].nextPoint].latLon))
      {
        pointToReplace = polygon.pointsByHash[findStartPointHash].nextPoint;

        polygon.pointsByHash[pointToReplace].prevPoint = pointHash;
        polygon.pointsByHash[findStartPointHash].nextPoint = pointHash;
        polygon.pointsByHash[pointHash].prevPoint = findStartPointHash;
        polygon.pointsByHash[pointHash].nextPoint = pointToReplace;

      } else if (polygon.pointsByHash[polygon.pointsByHash[findStartPointHash].prevPoint].intersectionPoint && 
        SegmentUtils.pointOnSegment(point, polygon.pointsByHash[findStartPointHash].latLon, polygon.pointsByHash[polygon.pointsByHash[findStartPointHash].prevPoint].latLon))
      {
        pointToReplace = polygon.pointsByHash[findStartPointHash].prevPoint;

        polygon.pointsByHash[pointToReplace].nextPoint = pointHash;
        polygon.pointsByHash[findStartPointHash].prevPoint = pointHash;
        polygon.pointsByHash[pointHash].nextPoint = findStartPointHash;
        polygon.pointsByHash[pointHash].prevPoint = pointToReplace;

      } else if (polygon.pointsByHash[polygon.pointsByHash[findEndPointHash].nextPoint].intersectionPoint && 
        SegmentUtils.pointOnSegment(point, polygon.pointsByHash[findEndPointHash].latLon, polygon.pointsByHash[polygon.pointsByHash[findEndPointHash].nextPoint].latLon))
      {
        pointToReplace = polygon.pointsByHash[findEndPointHash].nextPoint;

        polygon.pointsByHash[pointToReplace].prevPoint = pointHash;
        polygon.pointsByHash[findEndPointHash].nextPoint = pointHash;
        polygon.pointsByHash[pointHash].prevPoint = findStartPointHash;
        polygon.pointsByHash[pointHash].nextPoint = pointToReplace;

      } else if (polygon.pointsByHash[polygon.pointsByHash[findEndPointHash].prevPoint].intersectionPoint && 
        SegmentUtils.pointOnSegment(point, polygon.pointsByHash[findEndPointHash].latLon, polygon.pointsByHash[polygon.pointsByHash[findEndPointHash].prevPoint].latLon))
      {
        pointToReplace = polygon.pointsByHash[findEndPointHash].prevPoint;

        polygon.pointsByHash[pointToReplace].nextPoint = pointHash;
        polygon.pointsByHash[findEndPointHash].prevPoint = pointHash;
        polygon.pointsByHash[pointHash].nextPoint = findEndPointHash;
        polygon.pointsByHash[pointHash].prevPoint = pointToReplace;

      } else {
        emit LogPlacePointBetween(point, polygon.pointsByHash[findStartPointHash].latLon, polygon.pointsByHash[findEndPointHash].latLon);
        emit LogPlacePointBetween(point, polygon.pointsByHash[polygon.pointsByHash[findStartPointHash].nextPoint].latLon, polygon.pointsByHash[polygon.pointsByHash[findStartPointHash].prevPoint].latLon);
        emit LogPlacePointBetween(point, polygon.pointsByHash[polygon.pointsByHash[findEndPointHash].nextPoint].latLon, polygon.pointsByHash[polygon.pointsByHash[findEndPointHash].prevPoint].latLon);
        require(false, "Found intersection point cant be placed in polygon");
      }
      return true;
    }
    return false;
  }

  function buildResultPolygon(State storage state) public returns (bool) {
    bytes32 curPointHash;
    bytes32 startPointHash;

    for (uint j = 0; j < state.basePolygon.intersectionPoints.length; j++) {
      if (!state.basePolygon.pointsByHash[curPointHash].includedInResult) {
        curPointHash = state.basePolygon.intersectionPoints[j];
        startPointHash = curPointHash;
        break;
      }
      if (state.basePolygon.intersectionPoints.length - 1 == j) {
        return false;
      }
    }

    bytes32 nextPointHash;
    Direction baseDirection;

    // find direction and next point
    //TODO: need to add OR intersection point?
    if (PolygonUtils.isInsideCoors(state.basePolygon.pointsByHash[state.basePolygon.pointsByHash[curPointHash].nextPoint].latLon, state.cropPolygonInput)) {
      nextPointHash = state.basePolygon.pointsByHash[curPointHash].nextPoint;
      baseDirection = Direction.FORWARD;
    } else if (PolygonUtils.isInsideCoors(state.basePolygon.pointsByHash[state.basePolygon.pointsByHash[curPointHash].prevPoint].latLon, state.cropPolygonInput)) {
      nextPointHash = state.basePolygon.pointsByHash[curPointHash].prevPoint;
      baseDirection = Direction.BACKWARD;
    } else {
      require(false, "Not found adjoining points inside crop polygon");
    }

    PolygonUtils.CoorsPolygon memory newPolygon;
    state.resultPolygons.push(newPolygon);

    PolygonUtils.CoorsPolygon storage resultPolygon = state.resultPolygons[state.resultPolygons.length - 1];

    bytes32 prevPointHash;

    // fill resultPolygon from basePolygon
    while (true) {
      if (state.basePolygon.pointsByHash[curPointHash].intersectionPoint) {
        require(!state.basePolygon.pointsByHash[curPointHash].includedInResult, "basePolygon intersectionPoint already included");
        state.basePolygon.handledIntersectionPoints++;
        state.basePolygon.pointsByHash[curPointHash].includedInResult = true;
        emit LogIncludeIntersectionInResult("base", state.basePolygon.pointsByHash[curPointHash].latLon, state.basePolygon.handledIntersectionPoints);
      } else if (curPointHash == state.basePolygon.startPoint) {
        state.basePolygon.startPoint = nextPointHash;
      }

      emit LogPushToResult(state.basePolygon.pointsByHash[curPointHash].latLon);
      resultPolygon.points.push(state.basePolygon.pointsByHash[curPointHash].latLon);

      if (state.basePolygon.pointsByHash[curPointHash].intersectionPoint && curPointHash != startPointHash) {
        break;
      }

      prevPointHash = curPointHash;

      if (baseDirection == Direction.FORWARD) {
        curPointHash = state.basePolygon.pointsByHash[curPointHash].nextPoint;
        nextPointHash = state.basePolygon.pointsByHash[curPointHash].nextPoint;
      } else {
        curPointHash = state.basePolygon.pointsByHash[curPointHash].prevPoint;
        nextPointHash = state.basePolygon.pointsByHash[curPointHash].prevPoint;
      }
    }

    if (state.cropPolygon.pointsByHash[curPointHash].nextPoint == bytes32(0)) {
      require(false, "Intersection point not found in crop polygon");
    }

    Direction cropDirection;

    // find direction and next point
    //TODO: need to add OR intersection point?
    if (PolygonUtils.isInsideCoors(state.cropPolygon.pointsByHash[state.cropPolygon.pointsByHash[curPointHash].nextPoint].latLon, state.basePolygonInput) && state.cropPolygon.pointsByHash[curPointHash].nextPoint != prevPointHash) {
      nextPointHash = state.cropPolygon.pointsByHash[curPointHash].nextPoint;
      cropDirection = Direction.FORWARD;
    } else if (PolygonUtils.isInsideCoors(state.cropPolygon.pointsByHash[state.cropPolygon.pointsByHash[curPointHash].prevPoint].latLon, state.basePolygonInput) && state.cropPolygon.pointsByHash[curPointHash].prevPoint != prevPointHash) {
      nextPointHash = state.cropPolygon.pointsByHash[curPointHash].prevPoint;
      cropDirection = Direction.BACKWARD;
    } else {
      require(false, "Not found valid next point in crop polygon");
    }

    // fill resultPolygon from cropPolygon and change basePolygon to be cropped
    while (true) {
      if (baseDirection == Direction.FORWARD) {
        state.basePolygon.pointsByHash[curPointHash].prevPoint = nextPointHash;
        state.basePolygon.pointsByHash[curPointHash].latLon = state.cropPolygon.pointsByHash[curPointHash].latLon;
        state.basePolygon.pointsByHash[nextPointHash].nextPoint = curPointHash;
      } else {
        state.basePolygon.pointsByHash[curPointHash].nextPoint = nextPointHash;
        state.basePolygon.pointsByHash[curPointHash].latLon = state.cropPolygon.pointsByHash[curPointHash].latLon;
        state.basePolygon.pointsByHash[nextPointHash].prevPoint = curPointHash;
      }

      if (state.cropPolygon.pointsByHash[curPointHash].intersectionPoint) {
        state.cropPolygon.handledIntersectionPoints++;
        require(!state.cropPolygon.pointsByHash[curPointHash].includedInResult, "cropPolygon current intersectionPoint already included");
        state.cropPolygon.pointsByHash[curPointHash].includedInResult = true;
        emit LogIncludeIntersectionInResult("crop cur", state.cropPolygon.pointsByHash[curPointHash].latLon, state.cropPolygon.handledIntersectionPoints);
      }

      if (state.cropPolygon.pointsByHash[nextPointHash].intersectionPoint) {
        if (PointUtils.isEqual(state.cropPolygon.pointsByHash[nextPointHash].latLon, resultPolygon.points[0])) {
          state.cropPolygon.handledIntersectionPoints++;
          require(!state.cropPolygon.pointsByHash[nextPointHash].includedInResult, "cropPolygon next intersectionPoint already included");
          state.cropPolygon.pointsByHash[nextPointHash].includedInResult = true;
          emit LogIncludeIntersectionInResult("crop next", state.cropPolygon.pointsByHash[nextPointHash].latLon, state.cropPolygon.handledIntersectionPoints);
          //successful finish
          return true;
        } else {
          require(false, "End point of result polygon not equals to start point");
        }
      }
      emit LogSetNextPoint(state.cropPolygon.pointsByHash[curPointHash].latLon, state.cropPolygon.pointsByHash[curPointHash].intersectionPoint, state.cropPolygon.pointsByHash[nextPointHash].latLon);

      emit LogPushToResult(state.cropPolygon.pointsByHash[nextPointHash].latLon);
      resultPolygon.points.push(state.cropPolygon.pointsByHash[nextPointHash].latLon);

      curPointHash = nextPointHash;

      if (cropDirection == Direction.FORWARD) {
        nextPointHash = state.cropPolygon.pointsByHash[curPointHash].nextPoint;
      } else {
        nextPointHash = state.cropPolygon.pointsByHash[curPointHash].prevPoint;
      }
    }
  }

  function buildBasePolygonOutput(State storage state) public returns (bool) {
    require(state.basePolygonOutput.points.length == 0, "basePolygonOutput already build");
    require(state.basePolygon.handledIntersectionPoints == state.basePolygon.intersectionPoints.length, "Not all basePolygon intersectionPoints handled");
    require(state.cropPolygon.handledIntersectionPoints == state.cropPolygon.intersectionPoints.length, "Not all cropPolygon intersectionPoints handled");

    bytes32 currentPoint = state.basePolygon.startPoint;
    while (true) {
      emit LogPushToResult(state.basePolygon.pointsByHash[currentPoint].latLon);
      state.basePolygonOutput.points.push(state.basePolygon.pointsByHash[currentPoint].latLon);
      currentPoint = state.basePolygon.pointsByHash[currentPoint].nextPoint;
      if (currentPoint == state.basePolygon.startPoint) {
        break;
      }
    }
  }
}
