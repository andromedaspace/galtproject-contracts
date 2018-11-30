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
//pragma experimental ABIEncoderV2;

import "../collections/RedBlackTree.sol";
import "./MathUtils.sol";
import "./SegmentUtils.sol";
import "./VectorUtils.sol";
import "./PolygonUtils.sol";
import "../collections/SweepLineRedBlackTree.sol";
import "../collections/SweepQueueRedBlackTree.sol";

library MartinezRueda {
  int256 internal constant EPS = 1000000000;

  using RedBlackTree for RedBlackTree.Tree;

  // TODO: use stages
  enum Stage {
    NONE,
    INIT,
    SEGMENTS_SET,
    QUEUE_INSERT
  }

  struct OutputPoint {
    int256[2] point;
    int256[2][2] leftSegment;
    int256[2][2] rightSegment;
  }

  enum Operation {
    INTERSECTION,
    DIFFERENCE,
    UNION,
    XOR
  }

  struct State {
    uint8 maxHandleQueuePointsPerCall;

    PolygonUtils.CoorsPolygon subject;
    PolygonUtils.CoorsPolygon clipping;

    int256[4] subjectBbox;
    int256[4] clippingBbox;

    SweepEvent.Store store;

    SweepEvent.Tree eventQueue;
    SweepEvent.Tree sweepLineTree;
    uint256[] sortedEvents;
    uint256[] resultEvents;
    mapping(uint256 => bool) sweepProcessed;
    int256[2][][] resultContours;

    Operation operation;

    //    PointRedBlackTree.PointsTree queue;
    //    OutputPoint[] output;
    //    int256[2][2][] segments;
    //    mapping(uint256 => uint256[]) segmentsUpIndexesByQueueKey; // segments, for which this is the left end
    //
    //    mapping(uint256 => int256[2][2][]) segmentsLpByQueueKey; // segments, for which this is the right end
    //    mapping(uint256 => int256[2][2][]) segmentsCpByQueueKey; // segments, for which this is an inner point
    //
    //    mapping(bytes32 => uint256) segmentHashToStatusId;
    //    mapping(bytes32 => uint256) pointHashToQueueId;
  }

  function initMartinezRueda(State storage state) internal {
    //transaction reverted on maxHandleQueuePointsPerCall = 16 
    state.maxHandleQueuePointsPerCall = 6;

    state.subjectBbox = [MathUtils.INT256_MAX(), MathUtils.INT256_MAX(), MathUtils.INT256_MIN(), MathUtils.INT256_MIN()];
    state.clippingBbox = [MathUtils.INT256_MAX(), MathUtils.INT256_MAX(), MathUtils.INT256_MIN(), MathUtils.INT256_MIN()];
  }

  function processPolygon(State storage state, PolygonUtils.CoorsPolygon storage contourOrHole, bool isSubject, uint8 contourId, int256[4] storage bbox, bool isExteriorRing) public {
    int256[2] memory p1;
    int256[2] memory p2;

    for (uint i = 0; i < contourOrHole.points.length; i++) {
      p1 = contourOrHole.points[i];

      if (i == contourOrHole.points.length - 1) {
        p2 = contourOrHole.points[0];
      } else {
        p2 = contourOrHole.points[i + 1];
      }

      if (p1[0] == p2[0] && p1[1] == p2[1]) {
        continue;
        // skip collapsed edges, or it breaks
      }

      SweepEvent.Item memory e1;
      e1.id = state.eventQueue.tree.inserted + 1;
      e1.point = p1;
      e1.isSubject = isSubject;

      SweepEvent.Item memory e2;
      e2.id = state.eventQueue.tree.inserted + 2;
      e2.point = p2;
      e2.isSubject = isSubject;

      e1.otherEvent = e2.id;
      e2.otherEvent = e1.id;

      e1.contourId = contourId;
      e2.contourId = contourId;

      if (!isExteriorRing) {
        e1.isExteriorRing = false;
        e2.isExteriorRing = false;
      }

      if (SweepEventUtils.compareEvents(state.store, e1, e2) > 0) {
        e2.left = true;
      } else {
        e1.left = true;
      }

      bbox[0] = MathUtils.minInt(bbox[0], p1[0]);
      bbox[1] = MathUtils.minInt(bbox[1], p1[1]);
      bbox[2] = MathUtils.maxInt(bbox[2], p1[0]);
      bbox[3] = MathUtils.maxInt(bbox[3], p1[1]);

      // Pushing it so the queue is sorted from left to right,
      // with object on the left having the highest priority.
      SweepQueueRedBlackTree.insert(state.eventQueue, state.store, e1.id);
      SweepQueueRedBlackTree.insert(state.eventQueue, state.store, e2.id);
//
      state.store.sweepById[e1.id] = e1;
      state.store.sweepById[e2.id] = e2;
    }
  }
  
  function processSubjectPolygon(State storage state) public {
    processPolygon(state, state.subject, true, 1, state.subjectBbox, true);
  }

  function processClippingPolygon(State storage state) public {
    processPolygon(state, state.clipping, false, 2, state.clippingBbox, true);
  }

  function processAllPolygons(State storage state) public {
    processPolygon(state, state.subject, true, 1, state.subjectBbox, true);
    processPolygon(state, state.clipping, false, 2, state.clippingBbox, true);
  }
  
  function subdivideSegments(State storage state) public {
    int256 rightbound = MathUtils.minInt(state.subjectBbox[2], state.clippingBbox[2]);

    uint256 prev;
    uint256 prevPrev;
    uint256 next;
    uint256 begin;

    uint8 i = 0;

    while (state.eventQueue.tree.inserted != state.eventQueue.tree.removed) {
      SweepEvent.Item storage sweepEvent = state.store.sweepById[RedBlackTree.pop(state.eventQueue.tree)];
      state.sortedEvents.push(sweepEvent.id);
      // optimization by bboxes for intersection and difference goes here
      if (state.operation == Operation.INTERSECTION && sweepEvent.point[0] > rightbound
      || (state.operation == Operation.DIFFERENCE && sweepEvent.point[0] > state.subjectBbox[2])) {
        break;
      }
      if (sweepEvent.left) {
        prev = sweepEvent.id;
        next = sweepEvent.id;

        SweepLineRedBlackTree.insert(state.sweepLineTree, state.store, sweepEvent.id);
        begin = RedBlackTree.first(state.sweepLineTree.tree);

        if (prev == begin)
          prev = 0;
        else
          prev = RedBlackTree.prev(state.sweepLineTree.tree, prev);

        next = RedBlackTree.next(state.sweepLineTree.tree, next);

        computeFields(state, sweepEvent, state.store.sweepById[prev], state.operation);
        if (next != 0 && possibleIntersection(state, sweepEvent, state.store.sweepById[next]) == 2) {
          computeFields(state, sweepEvent, state.store.sweepById[prev], state.operation);
          computeFields(state, sweepEvent, state.store.sweepById[next], state.operation);
        }

        if (prev != 0 && possibleIntersection(state, state.store.sweepById[prev], sweepEvent) == 2) {
          if (prevPrev == begin)
            prevPrev = 0;
          else
            prevPrev = RedBlackTree.prev(state.sweepLineTree.tree, prev);

          computeFields(state, state.store.sweepById[prev], state.store.sweepById[prevPrev], state.operation);
          computeFields(state, sweepEvent, state.store.sweepById[prev], state.operation);
        }
      } else {
        sweepEvent = state.store.sweepById[sweepEvent.otherEvent];
        next = sweepEvent.id;
        prev = sweepEvent.id;

        if (prev != 0 && next != 0) {
          if (prev == begin)
            prev = 0;
          else
            prev = RedBlackTree.prev(state.sweepLineTree.tree, prev);

          next = RedBlackTree.next(state.sweepLineTree.tree, next);
          RedBlackTree.remove(state.sweepLineTree.tree, sweepEvent.id);

          if (next != 0 && prev != 0) {
            possibleIntersection(state, state.store.sweepById[prev], state.store.sweepById[next]);
          }
        }
      }

      i += 1;
      if (i >= state.maxHandleQueuePointsPerCall) {
        break;
      }
    }
  }

  function computeFields(State storage state, SweepEvent.Item storage sweepEvent, SweepEvent.Item storage prev, Operation operation) private {
    // compute inOut and otherInOut fields
    if (prev.id == 0) {
      sweepEvent.inOut = false;
      sweepEvent.otherInOut = true;

      // previous line segment in sweepline belongs to the same polygon
    } else {
      if (sweepEvent.isSubject == prev.isSubject) {
        sweepEvent.inOut = !prev.inOut;
        sweepEvent.otherInOut = prev.otherInOut;

        // previous line segment in sweepline belongs to the clipping polygon
      } else {
        sweepEvent.inOut = !prev.otherInOut;
        sweepEvent.otherInOut = SweepEventUtils.isVertical(state.store, prev) ? !prev.inOut : prev.inOut;
      }

      // compute prevInResult field
      if (prev.id != 0) {
        sweepEvent.prevInResult = (!inResult(prev, operation) || SweepEventUtils.isVertical(state.store, prev))
        ? prev.prevInResult : prev.id;
      }
    }

    // check if the line segment belongs to the Boolean operation
    sweepEvent.inResult = inResult(sweepEvent, operation);
  }

  function inResult(SweepEvent.Item storage sweepEvent, Operation operation) private returns (bool) {
    if (sweepEvent.eventType == SweepEvent.Type.NORMAL) {
      if (operation == Operation.INTERSECTION) {
        return !sweepEvent.otherInOut;
      } else if (operation == Operation.UNION) {
        return sweepEvent.otherInOut;
      } else if (operation == Operation.DIFFERENCE) {
        return (sweepEvent.isSubject && sweepEvent.otherInOut) || (!sweepEvent.isSubject && !sweepEvent.otherInOut);
      } else if (operation == Operation.XOR) {
        return true;
      }
    } else if (sweepEvent.eventType == SweepEvent.Type.SAME_TRANSITION) {
      return operation == Operation.INTERSECTION || operation == Operation.UNION;
    } else if (sweepEvent.eventType == SweepEvent.Type.DIFFERENT_TRANSITION) {
      return operation == Operation.DIFFERENCE;
    } else {
      return false;
    }
    return false;
  }

  function possibleIntersection(State storage state, SweepEvent.Item storage se1, SweepEvent.Item storage se2) private returns(int8) {
    // that disallows self-intersecting polygons,
    // did cost us half a day, so I'll leave it
    // out of respect
    // if (se1.isSubject == se2.isSubject) return;
    int256[2][2] memory inter = segmentIntersection(
      se1.point, state.store.sweepById[se1.otherEvent].point,
      se2.point, state.store.sweepById[se2.otherEvent].point
    );

    uint256 nintersections;
    if (inter[0][0] != 0 && inter[0][1] != 0) {
      if (inter[1][0] != 0 && inter[1][1] != 0) {
        nintersections = 2;
      } else {
        nintersections = 1;
      }
    }
    if (nintersections == 0) {
      return 0;
      // no intersection
    }

    // the line segments intersect at an endpoint of both line segments
    if ((nintersections == 1) && (SweepEventUtils.equals(se1.point, se2.point)
    || SweepEventUtils.equals(state.store.sweepById[se1.otherEvent].point, state.store.sweepById[se2.otherEvent].point))) {
      return 0;
    }

    if (nintersections == 2 && se1.isSubject == se2.isSubject) {
      return 0;
    }

    // The line segments associated to se1 and se2 intersect
    if (nintersections == 1) {
      // if the intersection point is not an endpoint of se1
      if (!SweepEventUtils.equals(se1.point, inter[0]) && !SweepEventUtils.equals(state.store.sweepById[se1.otherEvent].point, inter[0])) {
        divideSegment(state, se1.id, inter[0]);
      }
      // if the intersection point is not an endpoint of se2
      if (!SweepEventUtils.equals(se2.point, inter[0]) && !SweepEventUtils.equals(state.store.sweepById[se2.otherEvent].point, inter[0])) {
        divideSegment(state, se2.id, inter[0]);
      }
      return int8(1);
    }

    // The line segments associated to se1 and se2 overlap
    uint256[4] memory events;
    bool leftCoincide = false;
    bool rightCoincide = false;

    if (SweepEventUtils.equals(se1.point, se2.point)) {
      leftCoincide = true;
      // linked
    } else if (SweepEventUtils.compareEvents(state.store, se1, se2) == 1) {
      events[0] = se2.id;
      events[1] = se1.id;
    } else {
      events[0] = se1.id;
      events[1] = se2.id;
    }

    if (SweepEventUtils.equals(state.store.sweepById[se1.otherEvent].point, state.store.sweepById[se2.otherEvent].point)) {
      rightCoincide = true;
    } else if (SweepEventUtils.compareEvents(state.store, state.store.sweepById[se1.otherEvent], state.store.sweepById[se2.otherEvent]) == 1) {
      if (leftCoincide) {
        events[0] = se2.otherEvent;
        events[1] = se1.otherEvent;
      } else {
        events[2] = se2.otherEvent;
        events[3] = se1.otherEvent;
      }
    } else {
      if (leftCoincide) {
        events[0] = se1.otherEvent;
        events[1] = se2.otherEvent;
      } else {
        events[2] = se1.otherEvent;
        events[3] = se2.otherEvent;
      }
    }

    if ((leftCoincide && rightCoincide) || leftCoincide) {
      // both line segments are equal or share the left endpoint
      se2.eventType = SweepEvent.Type.NON_CONTRIBUTING;
      se1.eventType = (se2.inOut == se1.inOut) ? SweepEvent.Type.SAME_TRANSITION : SweepEvent.Type.DIFFERENT_TRANSITION;

      if (leftCoincide && !rightCoincide) {
        // honestly no idea, but changing events selection from [2, 1]
        // to [0, 1] fixes the overlapping self-intersecting polygons issue
        divideSegment(state, state.store.sweepById[events[1]].otherEvent, state.store.sweepById[events[0]].point);
      }
      return 2;
    }

    // the line segments share the right endpoint
    if (rightCoincide) {
      divideSegment(state, events[0], state.store.sweepById[events[1]].point);
      return 3;
    }

    // no line segment includes totally the other one
    if (events[0] != state.store.sweepById[events[3]].otherEvent) {
      divideSegment(state, events[0], state.store.sweepById[events[1]].point);
      divideSegment(state, events[1], state.store.sweepById[events[2]].point);
      return 3;
    }

    // one line segment includes the other one
    divideSegment(state, events[0], state.store.sweepById[events[1]].point);
    divideSegment(state, state.store.sweepById[events[3]].otherEvent, state.store.sweepById[events[2]].point);

    return 3;
  }

  function divideSegment(State storage state, uint256 seId, int256[2] p) private {
    SweepEvent.Item storage se = state.store.sweepById[seId];

    SweepEvent.Item memory r;
    r.id = state.eventQueue.tree.inserted + 1;
    r.point = p;
    r.otherEvent = se.id;
    r.isSubject = se.isSubject;
    r.contourId = se.contourId;

    SweepEvent.Item memory l;
    l.id = state.eventQueue.tree.inserted + 2;
    l.point = p;
    l.left = true;
    l.otherEvent = se.otherEvent;
    l.isSubject = se.isSubject;
    l.contourId = se.contourId;

    /* eslint-disable no-console */
    if (SweepEventUtils.equals(se.point, state.store.sweepById[se.otherEvent].point)) {
      require(false, "Possibly collapsed segment");
      //      console.warn('what is that, a collapsed segment?', se);
    }
    /* eslint-enable no-console */

    // avoid a rounding error. The left event would be processed after the right event
    if (SweepEventUtils.compareEvents(state.store, l, state.store.sweepById[se.otherEvent]) > 0) {
      state.store.sweepById[se.otherEvent].left = true;
      l.left = false;
    }

    // avoid a rounding error. The left event would be processed after the right event
    // if (compareEvents(se, r) > 0) {}

    state.store.sweepById[se.otherEvent].otherEvent = l.id;
    se.otherEvent = r.id;

    SweepQueueRedBlackTree.insert(state.eventQueue, state.store, r.id);
    SweepQueueRedBlackTree.insert(state.eventQueue, state.store, l.id);

    state.store.sweepById[r.id] = r;
    state.store.sweepById[l.id] = l;
  }

  //function to convert back to regular point form:
  function toPoint(int256[2] p, int256 s, int256[2] d) private returns (int256[2]) {
    return [
      p[0] + s * d[0],
      p[1] + s * d[1]
    ];
  }
  /**
   * Finds the magnitude of the cross product of two vectors (if we pretend
   * they're in three dimensions)
   */
  function crossProduct(int256[2] a, int256[2] b) private returns (int256) {
    return (a[0] * b[1]) - (a[1] * b[0]);
  }

  /**
 * Finds the dot product of two vectors.
 */
  function dotProduct(int256[2] a, int256[2] b) private returns (int256) {
    return (a[0] * b[0]) + (a[1] * b[1]);
  }

  /**
   * Finds the intersection (if any) between two line segments a and b, given the
   * line segments' end points a1, a2 and b1, b2.
   *
   * This algorithm is based on Schneider and Eberly.
   * http://www.cimec.org.ar/~ncalvo/Schneider_Eberly.pdf
   * Page 244.
   *
   * noEndpointTouch whether to skip single touchpoints (meaning connected segments) as intersections
   * Return if the lines intersect, the point of intersection. If they overlap, the two end points of the overlapping segment.
   * Otherwise, null.
   */
  function segmentIntersection(int256[2] a1, int256[2] a2, int256[2] b1, int256[2] b2) private returns (int256[2][2] result) {
    // The algorithm expects our lines in the form P + sd, where P is a point,
    // s is on the interval [0, 1], and d is a vector.
    // We are passed two points. P can be the first point of each pair. The
    // vector, then, could be thought of as the distance (in x and y components)
    // from the first point to the second point.
    // So first, let's make our vectors:
    int256[2] memory va = [a2[0] - a1[0], a2[1] - a1[1]];
    int256[2] memory vb = [b2[0] - b1[0], b2[1] - b1[1]];

    // The rest is pretty much a straight port of the algorithm.
    int256[2] memory e = [b1[0] - a1[0], b1[1] - a1[1]];
    int256 kross = crossProduct(va, vb);
    int256 sqrKross = kross * kross;
    int256 sqrLenA = dotProduct(va, va);
    //const sqrLenB  = dotProduct(vb, vb);

    // Check for line intersection. This works because of the properties of the
    // cross product -- specifically, two vectors are parallel if and only if the
    // cross product is the 0 vector. The full calculation involves relative error
    // to account for possible very small line segments. See Schneider & Eberly
    // for details.
    if (sqrKross > 0/* EPS * sqrLenB * sqLenA */) {
      // If they're not parallel, then (because these are line segments) they
      // still might not actually intersect. This code checks that the
      // intersection point of the lines is actually on both line segments.
      int256 s = crossProduct(e, vb) / kross;
      if (s < 0 || s > 1) {
        // not on line segment a
        return;
      }
      int256 t = crossProduct(e, va) / kross;
      if (t < 0 || t > 1) {
        // not on line segment b
        return;
      }
      if (s == 0 || s == 1) {
        // on an endpoint of line segment a
//        if (!noEndpointTouch) {
          result[0] = toPoint(a1, s, va);
//        }
        return;
      }
      if (t == 0 || t == 1) {
        // on an endpoint of line segment b
//        if (!noEndpointTouch) {
          result[0] = toPoint(b1, t, vb);
//        }
        return;
      }
      result[0] = toPoint(a1, s, va);
      return;
    }

    // If we've reached this point, then the lines are either parallel or the
    // same, but the segments could overlap partially or fully, or not at all.
    // So we need to find the overlap, if any. To do that, we can use e, which is
    // the (vector) difference between the two initial points. If this is parallel
    // with the line itself, then the two lines are the same line, and there will
    // be overlap.
    //const sqrLenE = dotProduct(e, e);
    kross = crossProduct(e, va);
    sqrKross = kross * kross;

    if (sqrKross > 0 /* EPS * sqLenB * sqLenE */) {
      // Lines are just parallel, not the same. No overlap.
      return;
    }

    return segmentIntersectionStage2(a1, va, vb, e, sqrLenA);
  }
  
  function segmentIntersectionStage2(int256[2] a1, int256[2] memory va, int256[2] memory vb, int256[2] memory e, int256 sqrLenA) private returns (int256[2][2] result) {
    int256 sa = dotProduct(va, e) / sqrLenA;
    int256 sb = sa + dotProduct(va, vb) / sqrLenA;
    int256 smin = MathUtils.minInt(sa, sb);
    int256 smax = MathUtils.maxInt(sa, sb);

    // this is, essentially, the FindIntersection acting on floats from
    // Schneider & Eberly, just inlined into this function.
    if (smin <= 1 && smax >= 0) {

      // overlap on an end point
      if (smin == 1) {
        //        if (!noEndpointTouch) {
        result[0] = toPoint(a1, smin > 0 ? smin : 0, va);
        //        }
        return;
      }

      if (smax == 0) {
        //        if (!noEndpointTouch) {
        result[0] = toPoint(a1, smax < 1 ? smax : 1, va);
        //        }
        return;
      }

      //      if (noEndpointTouch && smin == 0 && smax == 1) {
      //        return;
      //      }

      // There's overlap on a segment -- two points of intersection. Return both.
      return [
      toPoint(a1, smin > 0 ? smin : 0, va),
      toPoint(a1, smax < 1 ? smax : 1, va)
      ];
    }

    return;
  }

  function orderEvents(State storage state) public {
    //    let sweepEvent, i, len, tmp;
    SweepEvent.Item memory sweepEvent;
    // Due to overlapping edges the resultEvents array can be not wholly sorted
    bool sorted = false;
    int tmp;
    uint i;

    for (i = 0; i < state.sortedEvents.length; i++) {
      sweepEvent = state.store.sweepById[state.sortedEvents[i]];
      if ((sweepEvent.left && sweepEvent.inResult) || (!sweepEvent.left && state.store.sweepById[sweepEvent.otherEvent].inResult)) {
        state.resultEvents.push(sweepEvent.id);
      }
    }
    
    while (!sorted) {
      sorted = true;
      for (i = 0; i < state.resultEvents.length; i++) {
        if ((i + 1) < state.resultEvents.length
            && SweepEventUtils.compareEvents(state.store, state.store.sweepById[state.resultEvents[i]], state.store.sweepById[state.resultEvents[i + 1]]) == 1) {
          tmp = int256(state.resultEvents[i]);
          state.resultEvents[i] = state.resultEvents[i + 1];
          state.resultEvents[i + 1] = uint256(tmp);
          sorted = false;
        }
      }
    }
    for (i = 0; i < state.resultEvents.length; i++) {
      sweepEvent = state.store.sweepById[state.resultEvents[i]];
      sweepEvent.pos = int256(i);
    }

    // imagine, the right sweepEvent is found in the beginning of the queue,
    // when his left counterpart is not marked yet
    for (i = 0; i < state.resultEvents.length; i++) {
      sweepEvent = state.store.sweepById[state.resultEvents[i]];
      if (!sweepEvent.left) {
        tmp = sweepEvent.pos;
        sweepEvent.pos = state.store.sweepById[sweepEvent.otherEvent].pos;
        state.store.sweepById[sweepEvent.otherEvent].pos = tmp;
      }
    }
  }

  function nextPos(State storage state, int256 pos, uint256 origIndex) private returns(int256) {
    int256 newPos = pos + 1;

    int256[2] memory p = state.store.sweepById[state.resultEvents[uint256(pos)]].point;
    int256[2] memory p1;

    if (uint256(newPos) < state.resultEvents.length) {
      p1 = state.store.sweepById[state.resultEvents[uint256(newPos)]].point;
    }

    // while in range and not the current one by value
    while (uint256(newPos) < state.resultEvents.length && p1[0] == p[0] && p1[1] == p[1]) {
      if (!state.sweepProcessed[uint256(newPos)]) {
        return newPos;
      } else {
        newPos++;
      }
      p1 = state.store.sweepById[state.resultEvents[uint256(newPos)]].point;
    }

    newPos = pos - 1;

    while (state.sweepProcessed[uint256(newPos)] && uint256(newPos) >= origIndex) {
      newPos--;
    }
    return newPos;
  }


  function connectEdges(State storage state) public {
    orderEvents(state);

    // "false"-filled array
    SweepEvent.Item memory sweepEvent;

    uint256 contourIndex = 0;

    for (uint i = 0; i < state.resultEvents.length; i++) {
      if (state.sweepProcessed[i]) {
        continue;
      }

      //    if (!state.resultEvents[i].isExteriorRing) {
      //    if (operation == DIFFERENCE && !state.resultEvents[i].isSubject && result.length == = 0) {
      //    result.push(contour);
      //    } else if (result.length == = 0) {
      //    result.push([[contour]]);
      //    } else {
      //    result[result.length - 1].push(contour[0]);
      //    }
      //    } else if (operation == = DIFFERENCE && !state.resultEvents[i].isSubject && result.length > 1) {
      //    result[result.length - 1].push(contour[0]);
      //    } else {
      //      result.push(contour);
      //    }

      int256 pos = int256(i);

      int256[2] memory initial = state.store.sweepById[state.resultEvents[i]].point;
      state.resultContours[contourIndex].push(initial);

      while (uint256(pos) >= i) {
        sweepEvent = state.store.sweepById[state.resultEvents[uint256(pos)]];
        state.sweepProcessed[uint256(pos)] = true;

        if (sweepEvent.left) {
          sweepEvent.resultInOut = false;
          sweepEvent.contourId = contourIndex;
        } else {
          state.store.sweepById[sweepEvent.otherEvent].resultInOut = true;
          state.store.sweepById[sweepEvent.otherEvent].contourId = contourIndex;
        }

        pos = sweepEvent.pos;
        state.sweepProcessed[uint256(pos)] = true;
        state.resultContours[contourIndex].push(state.store.sweepById[state.resultEvents[uint256(pos)]].point);
        pos = nextPos(state, pos, i);
      }

      pos = pos == -1 ? int256(i) : pos;

      sweepEvent = state.store.sweepById[state.resultEvents[uint256(pos)]];
      state.sweepProcessed[uint256(pos)] = true;
      state.sweepProcessed[uint256(sweepEvent.pos)] = true;
      state.store.sweepById[sweepEvent.otherEvent].resultInOut = true;
      state.store.sweepById[sweepEvent.otherEvent].contourId = contourIndex;
    }

    // Handle if the result is a polygon (eg not multipoly)
    // Commented it again, let's see what do we mean by that
    // if (result.length === 1) result = result[0];
//    return result;
  }


  function isSubdivideSegmentsOver(State storage state) public returns (bool) {
    return state.eventQueue.tree.inserted == state.eventQueue.tree.removed;
  }
}
