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

pragma solidity 0.5.10;

import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "@galtproject/libs/contracts/traits/OwnableAndInitializable.sol";
import "@galtproject/geodesic/contracts/utils/SegmentUtils.sol";
import "@galtproject/geodesic/contracts/utils/LandUtils.sol";
import "@galtproject/geodesic/contracts/utils/PolygonUtils.sol";
import "../registries/GaltGlobalRegistry.sol";
import "../registries/ContourVerificationSourceRegistry.sol";
import "../registries/interfaces/ISpaceGeoDataRegistry.sol";
import "../registries/interfaces/IFeeRegistry.sol";
import "../applications/interfaces/IContourModifierApplication.sol";
import "../ContourVerifiers.sol";
import "./AbstractApplication.sol";


contract ContourVerificationManager is OwnableAndInitializable, AbstractApplication {
  using SafeMath for uint256;
  using ArraySet for ArraySet.AddressSet;

  bytes32 public constant FEE_KEY = bytes32("CONTOUR_VERIFICATION");

  event NewApplication(uint256 indexed applicationId);
  event SetRequiredConfirmations(uint256 requiredConfirmations);
  event SetApprovalTimeout(uint256 approvalTimeout);
  event ClaimVerifierApprovalReward(uint256 indexed applicationId, address indexed operator, address indexed verifier);
  event GaltProtocolRewardAssigned(uint256 indexed applicationId);

  enum Action {
    ADD,
    MODIFY
  }

  enum Status {
    NULL,
    PENDING,
    APPROVAL_TIMEOUT,
    APPROVED,
    REJECTED
  }

  struct Application {
    Status status;
    address applicationContract;
    bytes32 externalApplicationId;
    uint256 approvalTimeoutInitiatedAt;
    address[] approvers;
    mapping(address => bool) verifierVoted;
    Action action;
    uint256 requiredConfirmations;
    uint256 approvalCount;
    address rejecter;
    bool executed;

    Rewards rewards;
    Currency currency;
  }

  struct Rewards {
    uint256 totalPaidFee;
    uint256 verifiersReward;
    uint256 verifierReward;
    uint256 galtProtocolReward;
    bool galtProtocolRewardPaidOut;
    mapping(address => bool) verifierRewardPaidOut;
  }

  uint256 public requiredConfirmations;
  uint256 public approvalTimeout;

  mapping(uint256 => Application) internal verificationQueue;

  // .......(TAIL)....queue.....(HEAD) ->
  // contour id for a new pushed contour
  uint256 public head;
  // current contour id to be reviewed by oracles
  uint256 public tail;

  modifier onlyValidContourVerifier(address _verifier) {
    require(
      ContourVerifiers(ggr.getContourVerifiersAddress()).isVerifierValid(_verifier, msg.sender),
      "Invalid operator"
    );

    _;
  }

  constructor () public {}

  function initialize(
    GaltGlobalRegistry _ggr
  )
    public
    isInitializer
  {
    ggr = _ggr;
  }

  function initialize(
    GaltGlobalRegistry _ggr,
    uint256 _requiredConfirmations,
    uint256 _approvalTimeout
  )
    external
    isInitializer
  {
    ggr = _ggr;
    requiredConfirmations = _requiredConfirmations;
    approvalTimeout = _approvalTimeout;
  }

  // OWNER INTERFACE

  function setRequiredConfirmations(uint256 _requiredConfirmations) external onlyOwner {
    require(_requiredConfirmations > 0, "Can't be 0");

    requiredConfirmations = _requiredConfirmations;
    emit SetRequiredConfirmations(_requiredConfirmations);
  }

  function setApprovalTimeout(uint256 _approvalTimeout) external onlyOwner {
    approvalTimeout = _approvalTimeout;
    emit SetApprovalTimeout(_approvalTimeout);
  }

  // USER INTERFACE

  function submit(address _applicationContract, bytes32 _externalApplicationId) external {
    ContourVerificationSourceRegistry(ggr.getContourVerificationSourceRegistryAddress())
      .requireValid(_applicationContract);
    IContourModifierApplication(_applicationContract).isCVApplicationPending(_externalApplicationId);

    uint256 id = head;
    head += 1;

    Application storage a = verificationQueue[id];
    require(a.status == Status.NULL, "Application already exists");

    _acceptPayment(a);

    a.status = Status.PENDING;
    a.applicationContract = _applicationContract;
    a.externalApplicationId = _externalApplicationId;
    a.requiredConfirmations = requiredConfirmations;

    emit NewApplication(id);
  }

  function approve(
    uint256 _aId,
    address _verifier
  )
    external
    onlyValidContourVerifier(_verifier)
  {
    Application storage a = verificationQueue[_aId];

    eligibleForCastingDecision(_aId, _verifier);

    a.verifierVoted[_verifier] = true;
    a.approvers.push(_verifier);
    a.approvalCount += 1;

    if (a.approvalCount == a.requiredConfirmations) {
      a.status = Status.APPROVAL_TIMEOUT;
      a.approvalTimeoutInitiatedAt = block.timestamp;
      tail += 1;
      _calculateAndStoreApprovalRewards(a);
    }
  }

  function pushApproval(uint256 _aId) external {
    Application storage a = verificationQueue[_aId];

    require(a.status == Status.APPROVAL_TIMEOUT, "Expect APPROVAL_TIMEOUT status");
    require(a.executed == false, "Already executed");
    require(a.approvalTimeoutInitiatedAt.add(approvalTimeout) < block.timestamp, "Expect APPROVAL_TIMEOUT status");

    a.status = Status.APPROVED;
    a.executed = true;

    IContourModifierApplication(a.applicationContract).cvApprove(a.externalApplicationId);
  }

  function pushRejection(uint256 _aId) external {
    Application storage a = verificationQueue[_aId];

    require(a.status == Status.REJECTED, "Expect REJECTED status");
    require(a.executed == false, "Already executed");
    a.executed = true;

    IContourModifierApplication(a.applicationContract).cvReject(a.externalApplicationId);
  }

  // Existing token intersection proofs

  // e-is-r
  function rejectWithExistingContourIntersectionProof(
    uint256 _aId,
    address _verifier,
    uint256 _existingTokenId,
    uint256 _existingContourSegmentFirstPointIndex,
    uint256 _existingContourSegmentFirstPoint,
    uint256 _existingContourSegmentSecondPoint,
    uint256 _verifyingContourSegmentFirstPointIndex,
    uint256 _verifyingContourSegmentFirstPoint,
    uint256 _verifyingContourSegmentSecondPoint
  )
    external
    onlyValidContourVerifier(_verifier)
  {
    eligibleForCastingDecision(_aId, _verifier);

    _denyWithExistingContourIntersectionProof(
      _aId,
      _verifier,
      _existingTokenId,
      _existingContourSegmentFirstPointIndex,
      _existingContourSegmentFirstPoint,
      _existingContourSegmentSecondPoint,
      _verifyingContourSegmentFirstPointIndex,
      _verifyingContourSegmentFirstPoint,
      _verifyingContourSegmentSecondPoint
    );
  }

  // e-is-f
  function reportInvalidApprovalWithExistingContourIntersectionProof(
    uint256 _aId,
    uint256 _existingTokenId,
    uint256 _existingContourSegmentFirstPointIndex,
    uint256 _existingContourSegmentFirstPoint,
    uint256 _existingContourSegmentSecondPoint,
    uint256 _verifyingContourSegmentFirstPointIndex,
    uint256 _verifyingContourSegmentFirstPoint,
    uint256 _verifyingContourSegmentSecondPoint
  )
    external
  {
    require(
      verificationQueue[_aId].status == Status.APPROVAL_TIMEOUT,
      "Expect APPROVAL_TIMEOUT status"
    );

    _denyWithExistingContourIntersectionProof(
      _aId,
      msg.sender,
      _existingTokenId,
      _existingContourSegmentFirstPointIndex,
      _existingContourSegmentFirstPoint,
      _existingContourSegmentSecondPoint,
      _verifyingContourSegmentFirstPointIndex,
      _verifyingContourSegmentFirstPoint,
      _verifyingContourSegmentSecondPoint
    );
  }

  // e-is-h
  function _denyWithExistingContourIntersectionProof(
    uint256 _aId,
    address _reporter,
    uint256 _existingTokenId,
    uint256 _existingContourSegmentFirstPointIndex,
    uint256 _existingContourSegmentFirstPoint,
    uint256 _existingContourSegmentSecondPoint,
    uint256 _verifyingContourSegmentFirstPointIndex,
    uint256 _verifyingContourSegmentFirstPoint,
    uint256 _verifyingContourSegmentSecondPoint
  )
    internal
  {
    Application storage a = verificationQueue[_aId];

    require(isSelfUpdateCase(_aId, _existingTokenId) == false, "Can't reject self-update action");

    ISpaceGeoDataRegistry geoDataRegistry = ISpaceGeoDataRegistry(ggr.getSpaceGeoDataRegistryAddress());

    uint256[] memory existingTokenContour = geoDataRegistry.getSpaceTokenContour(_existingTokenId);
    ISpaceGeoDataRegistry.SpaceTokenType existingSpaceTokenType = geoDataRegistry.getSpaceTokenType(_existingTokenId);

    _requireSameTokenType(_aId, existingSpaceTokenType);

    bool intersects = _checkContourIntersects(
      _aId,
      existingTokenContour,
      _existingContourSegmentFirstPointIndex,
      _existingContourSegmentFirstPoint,
      _existingContourSegmentSecondPoint,
      _verifyingContourSegmentFirstPointIndex,
      _verifyingContourSegmentFirstPoint,
      _verifyingContourSegmentSecondPoint
    );

    if (intersects == true) {
      if (existingSpaceTokenType == ISpaceGeoDataRegistry.SpaceTokenType.ROOM) {
        int256 existingTokenHighestPoint = geoDataRegistry.getSpaceTokenHighestPoint(_existingTokenId);
        require(
          _checkVerticalIntersects(_aId, existingTokenContour, existingTokenHighestPoint) == true,
          "No intersection neither among contours nor among heights"
        );
      } else {
        revert("Contours don't intersect");
      }
    }

    _executeReject(_aId, _reporter);
  }

  function _requireSameTokenType(uint256 _aId, ISpaceGeoDataRegistry.SpaceTokenType _existingSpaceTokenType) internal {
    Application storage a = verificationQueue[_aId];
    ISpaceGeoDataRegistry.SpaceTokenType verifyingSpaceTokenType = IContourModifierApplication(a.applicationContract).getCVSpaceTokenType(a.externalApplicationId);
    require(_existingSpaceTokenType == verifyingSpaceTokenType, "Existing/Verifying space token types mismatch");
  }

  function _checkVerticalIntersects(
    uint256 _aId,
    uint256[] memory existingContour,
    int256 eHP
  )
    internal
    returns (bool)
  {
    Application storage a = verificationQueue[_aId];

    IContourModifierApplication applicationContract = IContourModifierApplication(a.applicationContract);
    uint256[] memory verifyingTokenContour = applicationContract.getCVContour(a.externalApplicationId);
    int256 vHP = applicationContract.getCVHighestPoint(a.externalApplicationId);

    int256 vLP = _getLowestElevation(verifyingTokenContour);
    int256 eLP = _getLowestElevation(verifyingTokenContour);

    if (eHP < vHP && eHP > vLP) {
      return true;
    }

    if (vHP < eHP && vHP > eLP) {
      return true;
    }

    if (eLP < vHP && eLP > vLP) {
      return true;
    }

    if (vLP < eHP && vLP > eLP) {
      return true;
    }

    return false;
  }

  function _getLowestElevation(
    uint256[] memory _contour
  )
    internal
    view
    returns (int256)
  {
    uint256 len = _contour.length;
    int256 theLowest;

    for (uint256 i = 0; i < len; i++) {
      (int256 elevation,) = GeohashUtils.geohash5zToGeohash(_contour[i]);
      if (elevation < theLowest) {
        theLowest = elevation;
      }
    }

    return theLowest;
  }

  // Existing token inclusion proofs

  // e-in-r
  function rejectWithExistingPointInclusionProof(
    uint256 _aId,
    address _verifier,
    uint256 _existingTokenId,
    uint256 _verifyingContourPointIndex,
    uint256 _verifyingContourPoint
  )
    external
    onlyValidContourVerifier(_verifier)
  {
    eligibleForCastingDecision(_aId, _verifier);

    _denyWithExistingPointInclusionProof(
      _aId,
      _verifier,
      _existingTokenId,
      _verifyingContourPointIndex,
      _verifyingContourPoint
    );
  }

  // e-in-f
  function reportInvalidApprovalWithExistingPointInclusionProof(
    uint256 _aId,
    uint256 _existingTokenId,
    uint256 _verifyingContourPointIndex,
    uint256 _verifyingContourPoint
  )
    external
  {
    require(
      verificationQueue[_aId].status == Status.APPROVAL_TIMEOUT,
      "Expect APPROVAL_TIMEOUT status"
    );

    _denyWithExistingPointInclusionProof(
      _aId,
      msg.sender,
      _existingTokenId,
      _verifyingContourPointIndex,
      _verifyingContourPoint
    );
  }

  // e-in-h
  function _denyWithExistingPointInclusionProof(
    uint256 _aId,
    address _reporter,
    uint256 _existingTokenId,
    uint256 _verifyingContourPointIndex,
    uint256 _verifyingContourPoint
  )
    internal
  {
    Application storage a = verificationQueue[_aId];

    require(isSelfUpdateCase(_aId, _existingTokenId) == false, "Can't reject self-update action");

    ISpaceGeoDataRegistry geoDataRegistry = ISpaceGeoDataRegistry(ggr.getSpaceGeoDataRegistryAddress());

    uint256[] memory existingTokenContour = geoDataRegistry.getSpaceTokenContour(_existingTokenId);
    ISpaceGeoDataRegistry.SpaceTokenType existingSpaceTokenType = geoDataRegistry.getSpaceTokenType(_existingTokenId);

    _requireSameTokenType(_aId, existingSpaceTokenType);

    bool isInside = _checkPointInsideContour(
      _aId,
      existingTokenContour,
      _verifyingContourPointIndex,
      _verifyingContourPoint
    );
    if (isInside == true) {
      if (existingSpaceTokenType == ISpaceGeoDataRegistry.SpaceTokenType.ROOM) {
        int256 existingTokenHighestPoint = geoDataRegistry.getSpaceTokenHighestPoint(_existingTokenId);
        require(
          _checkVerticalIntersects(_aId, existingTokenContour, existingTokenHighestPoint) == true,
          "Contour inclusion/height intersection not found"
        );
      } else {
        revert("Existing contour doesn't include verifying");
      }
    }

    _executeReject(_aId, _reporter);
  }

  // Application approved token intersection proofs

  // aa-is-r
  function rejectWithApplicationApprovedContourIntersectionProof(
    uint256 _aId,
    address _verifier,
    address _applicationContract,
    bytes32 _externalApplicationId,
    uint256 _existingContourSegmentFirstPointIndex,
    uint256 _existingContourSegmentFirstPoint,
    uint256 _existingContourSegmentSecondPoint,
    uint256 _verifyingContourSegmentFirstPointIndex,
    uint256 _verifyingContourSegmentFirstPoint,
    uint256 _verifyingContourSegmentSecondPoint
  )
    external
    onlyValidContourVerifier(_verifier)
  {
    eligibleForCastingDecision(_aId, _verifier);

    _denyWithApplicationApprovedContourIntersectionProof(
      _aId,
      _verifier,
      _applicationContract,
      _externalApplicationId,
      _existingContourSegmentFirstPointIndex,
      _existingContourSegmentFirstPoint,
      _existingContourSegmentSecondPoint,
      _verifyingContourSegmentFirstPointIndex,
      _verifyingContourSegmentFirstPoint,
      _verifyingContourSegmentSecondPoint
    );
  }

  // aa-is-f
  function reportInvalidApprovalWithApplicationApprovedContourIntersectionProof(
    uint256 _aId,
    address _applicationContract,
    bytes32 _externalApplicationId,
    uint256 _existingContourSegmentFirstPointIndex,
    uint256 _existingContourSegmentFirstPoint,
    uint256 _existingContourSegmentSecondPoint,
    uint256 _verifyingContourSegmentFirstPointIndex,
    uint256 _verifyingContourSegmentFirstPoint,
    uint256 _verifyingContourSegmentSecondPoint
  )
    external
  {
    require(
      verificationQueue[_aId].status == Status.APPROVAL_TIMEOUT,
      "Expect APPROVAL_TIMEOUT status"
    );

    _denyWithApplicationApprovedContourIntersectionProof(
      _aId,
      msg.sender,
      _applicationContract,
      _externalApplicationId,
      _existingContourSegmentFirstPointIndex,
      _existingContourSegmentFirstPoint,
      _existingContourSegmentSecondPoint,
      _verifyingContourSegmentFirstPointIndex,
      _verifyingContourSegmentFirstPoint,
      _verifyingContourSegmentSecondPoint
    );
  }

  // aa-is-h
  function _denyWithApplicationApprovedContourIntersectionProof(
    uint256 _aId,
    address _reporter,
    address _applicationContract,
    bytes32 _externalApplicationId,
    uint256 _existingContourSegmentFirstPointIndex,
    uint256 _existingContourSegmentFirstPoint,
    uint256 _existingContourSegmentSecondPoint,
    uint256 _verifyingContourSegmentFirstPointIndex,
    uint256 _verifyingContourSegmentFirstPoint,
    uint256 _verifyingContourSegmentSecondPoint
  )
    internal
  {
    Application storage a = verificationQueue[_aId];

    ContourVerificationSourceRegistry(ggr.getContourVerificationSourceRegistryAddress())
      .requireValid(_applicationContract);
    IContourModifierApplication applicationContract = IContourModifierApplication(_applicationContract);
    require(applicationContract.isCVApplicationApproved(_externalApplicationId), "Not in CVApplicationApproved list");

    ISpaceGeoDataRegistry.SpaceTokenType existingSpaceTokenType = applicationContract.getCVSpaceTokenType(_externalApplicationId);

    _requireSameTokenType(_aId, existingSpaceTokenType);

    bool intersects = _checkContourIntersects(
      _aId,
      applicationContract.getCVContour(_externalApplicationId),
      _existingContourSegmentFirstPointIndex,
      _existingContourSegmentFirstPoint,
      _existingContourSegmentSecondPoint,
      _verifyingContourSegmentFirstPointIndex,
      _verifyingContourSegmentFirstPoint,
      _verifyingContourSegmentSecondPoint
    );

    if (intersects == true) {
      if (existingSpaceTokenType == ISpaceGeoDataRegistry.SpaceTokenType.ROOM) {
        require(
          _checkVerticalIntersects(
            _aId,
            applicationContract.getCVContour(_externalApplicationId),
            applicationContract.getCVHighestPoint(_externalApplicationId)
          ) == true,
          "No intersection neither among contours nor among heights"
        );
      } else {
        revert("Contours don't intersect");
      }
    }

    _executeReject(_aId, _reporter);
  }

  // Application approved token inclusion proofs

  // aa-in-r
  function rejectWithApplicationApprovedPointInclusionProof(
    uint256 _aId,
    address _reporter,
    address _applicationContract,
    bytes32 _externalApplicationId,
    uint256 _verifyingContourPointIndex,
    uint256 _verifyingContourPoint
  )
    external
    onlyValidContourVerifier(_reporter)
  {
    eligibleForCastingDecision(_aId, _reporter);

    _denyWithApplicationApprovedPointInclusionProof(
      _aId,
      _reporter,
      _applicationContract,
      _externalApplicationId,
      _verifyingContourPointIndex,
      _verifyingContourPoint
    );
  }

  // aa-in-f
  function reportInvalidApprovalWithApplicationApprovedPointInclusionProof(
    uint256 _aId,
    address _applicationContract,
    bytes32 _externalApplicationId,
    uint256 _verifyingContourPointIndex,
    uint256 _verifyingContourPoint
  )
    external
  {
    require(
      verificationQueue[_aId].status == Status.APPROVAL_TIMEOUT,
      "Expect APPROVAL_TIMEOUT status"
    );

    _denyWithApplicationApprovedPointInclusionProof(
      _aId,
      msg.sender,
      _applicationContract,
      _externalApplicationId,
      _verifyingContourPointIndex,
      _verifyingContourPoint
    );
  }

  // aa-in-h
  function _denyWithApplicationApprovedPointInclusionProof(
    uint256 _aId,
    address _reporter,
    address _applicationContract,
    bytes32 _externalApplicationId,
    uint256 _verifyingContourPointIndex,
    uint256 _verifyingContourPoint
  )
    internal
  {
    Application storage a = verificationQueue[_aId];

    ContourVerificationSourceRegistry(ggr.getContourVerificationSourceRegistryAddress())
      .requireValid(_applicationContract);
    IContourModifierApplication applicationContract = IContourModifierApplication(_applicationContract);
    require(applicationContract.isCVApplicationApproved(_externalApplicationId), "Not in CVApplicationApproved list");

    ISpaceGeoDataRegistry.SpaceTokenType existingSpaceTokenType = applicationContract.getCVSpaceTokenType(_externalApplicationId);

    _requireSameTokenType(_aId, existingSpaceTokenType);

    bool isInside = _checkPointInsideContour(
      _aId,
      applicationContract.getCVContour(_externalApplicationId),
      _verifyingContourPointIndex,
      _verifyingContourPoint
    );

    if (isInside == true) {
      if (existingSpaceTokenType == ISpaceGeoDataRegistry.SpaceTokenType.ROOM) {
        require(
          _checkVerticalIntersects(
            _aId,
            applicationContract.getCVContour(_externalApplicationId),
            applicationContract.getCVHighestPoint(_externalApplicationId)
          ) == true,
          "No inclusion neither among contours nor among heights"
        );
      } else {
        revert("Existing contour doesn't include verifying");
      }
    }

    _executeReject(_aId, _reporter);
  }

  // Approved (TIMEOUT) token intersection proofs

  // at-is-r
  function rejectWithApplicationApprovedTimeoutContourIntersectionProof(
    uint256 _aId,
    address _verifier,
    address _applicationContract,
    uint256 _existingCVApplicationId,
    uint256 _existingContourSegmentFirstPointIndex,
    uint256 _existingContourSegmentFirstPoint,
    uint256 _existingContourSegmentSecondPoint,
    uint256 _verifyingContourSegmentFirstPointIndex,
    uint256 _verifyingContourSegmentFirstPoint,
    uint256 _verifyingContourSegmentSecondPoint
  )
    external
    onlyValidContourVerifier(_verifier)
  {
    eligibleForCastingDecision(_aId, _verifier);

    _denyWithApplicationApprovedTimeoutContourIntersectionProof(
      _aId,
      _verifier,
      _existingCVApplicationId,
      _existingContourSegmentFirstPointIndex,
      _existingContourSegmentFirstPoint,
      _existingContourSegmentSecondPoint,
      _verifyingContourSegmentFirstPointIndex,
      _verifyingContourSegmentFirstPoint,
      _verifyingContourSegmentSecondPoint
    );
  }

  // at-is-f
  function reportInvalidApprovalWithApplicationApprovedTimeoutContourIntersectionProof(
    uint256 _aId,
    address _applicationContract,
    uint256 _existingCVApplicationId,
    uint256 _existingContourSegmentFirstPointIndex,
    uint256 _existingContourSegmentFirstPoint,
    uint256 _existingContourSegmentSecondPoint,
    uint256 _verifyingContourSegmentFirstPointIndex,
    uint256 _verifyingContourSegmentFirstPoint,
    uint256 _verifyingContourSegmentSecondPoint
  )
    external
  {
    require(
      verificationQueue[_aId].status == Status.APPROVAL_TIMEOUT,
      "Expect APPROVAL_TIMEOUT status for reporting application"
    );
    require(
      _existingCVApplicationId < _aId,
      "Existing application ID should be less than reporting ID"
    );

    _denyWithApplicationApprovedTimeoutContourIntersectionProof(
      _aId,
      msg.sender,
      _existingCVApplicationId,
      _existingContourSegmentFirstPointIndex,
      _existingContourSegmentFirstPoint,
      _existingContourSegmentSecondPoint,
      _verifyingContourSegmentFirstPointIndex,
      _verifyingContourSegmentFirstPoint,
      _verifyingContourSegmentSecondPoint
    );
  }

  // at-is-h
  function _denyWithApplicationApprovedTimeoutContourIntersectionProof(
    uint256 _aId,
    address _reporter,
    uint256 _existingCVApplicationId,
    uint256 _existingContourSegmentFirstPointIndex,
    uint256 _existingContourSegmentFirstPoint,
    uint256 _existingContourSegmentSecondPoint,
    uint256 _verifyingContourSegmentFirstPointIndex,
    uint256 _verifyingContourSegmentFirstPoint,
    uint256 _verifyingContourSegmentSecondPoint
  )
    internal
  {
    Application storage a = verificationQueue[_aId];
    Application storage existingA = verificationQueue[_existingCVApplicationId];

    require(
      existingA.status == Status.APPROVAL_TIMEOUT,
      "Expect APPROVAL_TIMEOUT status for existing application"
    );

    IContourModifierApplication existingApplicationContract = IContourModifierApplication(existingA.applicationContract);
    ISpaceGeoDataRegistry.SpaceTokenType existingSpaceTokenType = existingApplicationContract.getCVSpaceTokenType(existingA.externalApplicationId);

    _requireSameTokenType(_aId, existingSpaceTokenType);

    bool intersects = _checkContourIntersects(
      _aId,
      existingApplicationContract.getCVContour(existingA.externalApplicationId),
      _existingContourSegmentFirstPointIndex,
      _existingContourSegmentFirstPoint,
      _existingContourSegmentSecondPoint,
      _verifyingContourSegmentFirstPointIndex,
      _verifyingContourSegmentFirstPoint,
      _verifyingContourSegmentSecondPoint
    );

    if (intersects == true) {
      if (existingSpaceTokenType == ISpaceGeoDataRegistry.SpaceTokenType.ROOM) {
        require(
          _checkVerticalIntersects(
            _aId,
            existingApplicationContract.getCVContour(existingA.externalApplicationId),
            existingApplicationContract.getCVHighestPoint(existingA.externalApplicationId)
          ) == true,
          "No intersection neither among contours nor among heights"
        );
      } else {
        revert("Contours don't intersect");
      }
    }

    _executeReject(_aId, _reporter);
  }

  // Approved (TIMEOUT) token inclusion proofs

  // at-in-r
  function rejectWithApplicationApprovedTimeoutPointInclusionProof(
    uint256 _aId,
    address _verifier,
    uint256 _existingCVApplicationId,
    uint256 _verifyingContourPointIndex,
    uint256 _verifyingContourPoint
  )
    external
    onlyValidContourVerifier(_verifier)
  {
    eligibleForCastingDecision(_aId, _verifier);

    _denyInvalidApprovalWithApplicationApprovedTimeoutPointInclusionProof(
      _aId,
      _verifier,
      _existingCVApplicationId,
      _verifyingContourPointIndex,
      _verifyingContourPoint
    );
  }

  // at-in-f
  function reportInvalidApprovalWithApplicationApprovedTimeoutPointInclusionProof(
    uint256 _aId,
    uint256 _existingCVApplicationId,
    uint256 _verifyingContourPointIndex,
    uint256 _verifyingContourPoint
  )
    external
  {
    Application storage a = verificationQueue[_aId];

    require(
      a.status == Status.APPROVAL_TIMEOUT,
      "Expect APPROVAL_TIMEOUT status for reporting application"
    );
    require(
      _existingCVApplicationId < _aId,
      "Existing application ID should be less than reporting ID"
    );

    _denyInvalidApprovalWithApplicationApprovedTimeoutPointInclusionProof(
      _aId,
      msg.sender,
      _existingCVApplicationId,
      _verifyingContourPointIndex,
      _verifyingContourPoint
    );
  }

  // at-in-h
  function _denyInvalidApprovalWithApplicationApprovedTimeoutPointInclusionProof(
    uint256 _aId,
    address _reporter,
    uint256 _existingCVApplicationId,
    uint256 _verifyingContourPointIndex,
    uint256 _verifyingContourPoint
  )
    internal
  {
    Application storage a = verificationQueue[_aId];
    Application storage existingA = verificationQueue[_existingCVApplicationId];

    require(
      existingA.status == Status.APPROVAL_TIMEOUT,
      "Expect APPROVAL_TIMEOUT status for existing application"
    );

    IContourModifierApplication existingApplicationContract = IContourModifierApplication(existingA.applicationContract);
    ISpaceGeoDataRegistry.SpaceTokenType existingSpaceTokenType = existingApplicationContract.getCVSpaceTokenType(existingA.externalApplicationId);

    _requireSameTokenType(_aId, existingSpaceTokenType);

    bool isInside = _checkPointInsideContour(
      _aId,
      IContourModifierApplication(existingA.applicationContract).getCVContour(existingA.externalApplicationId),
      _verifyingContourPointIndex,
      _verifyingContourPoint
    );

    if (isInside == true) {
      if (existingSpaceTokenType == ISpaceGeoDataRegistry.SpaceTokenType.ROOM) {
        require(
          _checkVerticalIntersects(
            _aId,
            existingApplicationContract.getCVContour(existingA.externalApplicationId),
            existingApplicationContract.getCVHighestPoint(existingA.externalApplicationId)
          ) == true,
          "No inclusion neither among contours nor among heights"
        );
      } else {
        revert("Existing contour doesn't include verifying");
      }
    }

    _executeReject(_aId, _reporter);
  }

  function eligibleForCastingDecision(uint256 _aId, address _verifier) internal {
    Application storage a = verificationQueue[_aId];

    require(_aId == tail, "ID mismatches with the current");
    require(a.status == Status.PENDING, "Expect PENDING status");
    require(a.verifierVoted[_verifier] == false, "Operator has already verified the contour");
  }

  function _executeReject(uint256 _aId, address _verifier) internal {
    Application storage a = verificationQueue[_aId];

    a.verifierVoted[_verifier] = true;
    a.rejecter = _verifier;
    a.status = Status.REJECTED;
    tail += 1;

    _executeSlashing(a, _verifier);
    _calculateAndStoreRejectionRewards(a);
  }

  function _checkContourIntersects(
    uint256 _aId,
    uint256[] memory _existingTokenContour,
    uint256 _existingContourSegmentFirstPointIndex,
    uint256 _existingContourSegmentFirstPoint,
    uint256 _existingContourSegmentSecondPoint,
    uint256 _verifyingContourSegmentFirstPointIndex,
    uint256 _verifyingContourSegmentFirstPoint,
    uint256 _verifyingContourSegmentSecondPoint
  )
    internal
    returns (bool)
  {
    Application storage a = verificationQueue[_aId];

    // Existing Token
    require(
      _contourHasSegment(
        _existingContourSegmentFirstPointIndex,
        _existingContourSegmentFirstPoint,
        _existingContourSegmentSecondPoint,
        _existingTokenContour
      ),
      "Invalid segment for existing token"
    );

    // Verifying Token
    IContourModifierApplication applicationContract = IContourModifierApplication(a.applicationContract);

    applicationContract.isCVApplicationPending(a.externalApplicationId);
    uint256[] memory verifyingTokenContour = applicationContract.getCVContour(a.externalApplicationId);

    require(
      _contourHasSegment(
        _verifyingContourSegmentFirstPointIndex,
        _verifyingContourSegmentFirstPoint,
        _verifyingContourSegmentSecondPoint,
        verifyingTokenContour
      ),
      "Invalid segment for verifying token"
    );

    return SegmentUtils.segmentsIntersect(
      getLatLonSegment(_existingContourSegmentFirstPoint, _existingContourSegmentSecondPoint),
      getLatLonSegment(_verifyingContourSegmentFirstPoint, _verifyingContourSegmentSecondPoint)
    );
  }

  function _checkPointInsideContour(
    uint256 _aId,
    uint256[] memory _existingTokenContour,
    uint256 _verifyingContourPointIndex,
    uint256 _verifyingContourPoint
  )
    internal
    returns (bool)
  {
    Application storage a = verificationQueue[_aId];

    // Verifying Token
    IContourModifierApplication applicationContract = IContourModifierApplication(a.applicationContract);

    applicationContract.isCVApplicationPending(a.externalApplicationId);
    uint256[] memory verifyingTokenContour = applicationContract.getCVContour(a.externalApplicationId);

    require(
      verifyingTokenContour[_verifyingContourPointIndex] == _verifyingContourPoint,
      "Invalid point of verifying token"
    );

    return PolygonUtils.isInsideWithoutCache(_verifyingContourPoint, _existingTokenContour);
  }

  function _contourHasSegment(
    uint256 _firstPointIndex,
    uint256 _firstPoint,
    uint256 _secondPoint,
    uint256[] memory _contour
  )
    internal
    returns (bool)
  {
    uint256 len = _contour.length;
    require(len > 0, "Empty contour");
    require(_firstPointIndex < len, "Invalid existing coord index");

    if(_contour[_firstPointIndex] != _firstPoint) {
      return false;
    }

    uint256 secondPointIndex = _firstPointIndex + 1;
    if (secondPointIndex == len) {
      secondPointIndex = 0;
    }

    if(_contour[secondPointIndex] != _secondPoint) {
      return false;
    }

    return true;
  }

  function claimVerifierApprovalReward(uint256 _aId, address payable _verifier) external onlyValidContourVerifier(_verifier) {
    Application storage a = verificationQueue[_aId];
    Rewards storage r = a.rewards;

    require(a.status == Status.APPROVED, "Expect APPROVED status");
    require(r.verifierRewardPaidOut[_verifier] == false, "Reward has already paid out");
    require(a.verifierVoted[_verifier] == true, "Not voted on the application ");

    r.verifierRewardPaidOut[_verifier] = true;

    _calculateAndStoreApprovalRewards(a);
    _assignGaltProtocolReward(_aId);

    if (a.currency == Currency.ETH) {
      _verifier.transfer(r.verifierReward);
    } else if (a.currency == Currency.GALT) {
      ggr.getGaltToken().transfer(_verifier, r.verifierReward);
    }

    emit ClaimVerifierApprovalReward(_aId, msg.sender, _verifier);
  }

  function claimVerifierRejectionReward(uint256 _aId, address payable _verifier) external onlyValidContourVerifier(_verifier) {
    Application storage a = verificationQueue[_aId];
    Rewards storage r = a.rewards;

    require(a.status == Status.REJECTED, "Expect REJECTED status");
    require(r.verifierRewardPaidOut[_verifier] == false, "Reward has already paid out");
    require(a.verifierVoted[_verifier] == true, "Not voted on the application ");
    require(a.rejecter == _verifier, "Only rejecter allowed ");

    r.verifierRewardPaidOut[_verifier] = true;

    _calculateAndStoreRejectionRewards(a);
    _assignGaltProtocolReward(_aId);

    if (a.currency == Currency.ETH) {
      _verifier.transfer(r.verifierReward);
    } else if (a.currency == Currency.GALT) {
      ggr.getGaltToken().transfer(_verifier, r.verifierReward);
    }

    emit ClaimVerifierApprovalReward(_aId, msg.sender, _verifier);
  }

  // INTERNAL

  function isSelfUpdateCase(uint256 _aId, uint256 _existingTokenId) public view returns (bool) {
    Application storage a = verificationQueue[_aId];
    (IContourModifierApplication.ContourModificationType modificationType, uint256 spaceTokenId,) = IContourModifierApplication(a.applicationContract).getCVData(a.externalApplicationId);
    if (modificationType == IContourModifierApplication.ContourModificationType.UPDATE) {

      return (spaceTokenId ==_existingTokenId);
    }

    return false;
  }

  function _assignGaltProtocolReward(uint256 _aId) internal {
    Application storage a = verificationQueue[_aId];

    if (a.rewards.galtProtocolRewardPaidOut == false) {
      if (a.currency == Currency.ETH) {
        protocolFeesEth = protocolFeesEth.add(a.rewards.galtProtocolReward);
      } else if (a.currency == Currency.GALT) {
        protocolFeesGalt = protocolFeesGalt.add(a.rewards.galtProtocolReward);
      }

      a.rewards.galtProtocolRewardPaidOut = true;
      emit GaltProtocolRewardAssigned(_aId);
    }
  }

  function _acceptPayment(Application storage _a) internal {
    uint256 fee;
    if (msg.value == 0) {
      fee = IFeeRegistry(ggr.getFeeRegistryAddress()).getGaltFeeOrRevert(FEE_KEY);
      ggr.getGaltToken().transferFrom(msg.sender, address(this), fee);
      _a.currency = Currency.GALT;
    } else {
      fee = IFeeRegistry(ggr.getFeeRegistryAddress()).getEthFeeOrRevert(FEE_KEY);
      require(msg.value == fee, "Fee and msg.value not equal");
      // a.currency = Currency.ETH; by default
    }

    _parseFee(_a, fee);
  }

  function _parseFee(
    Application storage _a,
    uint256 _fee
  )
    internal
  {
    uint256 share;

    (uint256 ethFee, uint256 galtFee) = getProtocolShares();

    if (_a.currency == Currency.ETH) {
      share = ethFee;
    } else {
      share = galtFee;
    }

    uint256 galtProtocolReward = share.mul(_fee).div(100);
    uint256 verifiersReward = _fee.sub(galtProtocolReward);

    assert(verifiersReward.add(galtProtocolReward) == _fee);

    _a.rewards.totalPaidFee = _fee;
    _a.rewards.verifiersReward = verifiersReward;
    _a.rewards.galtProtocolReward = galtProtocolReward;
  }

  function _calculateAndStoreApprovalRewards(
    Application storage _a
  )
    internal
  {
    _a.rewards.verifierReward = _a.rewards.verifiersReward.div(_a.requiredConfirmations);
  }

  function _calculateAndStoreRejectionRewards(
    Application storage _a
  )
    internal
  {
    // An account who was able to invoke and prove the reject receives all the reward
    _a.rewards.verifierReward = _a.rewards.verifiersReward;
  }

  function _executeSlashing(
    Application storage _a,
    address _verifier
  )
    internal
  {
    ContourVerifiers(ggr.getContourVerifiersAddress()).slash(_a.approvers, _verifier);
  }

  // GETTERS

  function getLatLonSegment(
    uint256 _firstPointGeohash,
    uint256 _secondPointGeohash
  )
    public
    view
    returns (int256[2][2] memory)
  {
    (int256 lat1, int256 lon1) = LandUtils.geohash5ToLatLon(_firstPointGeohash);
    (int256 lat2, int256 lon2) = LandUtils.geohash5ToLatLon(_secondPointGeohash);

    int256[2] memory first = int256[2]([lat1, lon1]);
    int256[2] memory second = int256[2]([lat2, lon2]);

    return int256[2][2]([first, second]);
  }

  function paymentMethod(address _pgg) public view returns (PaymentMethod) {
    return PaymentMethod.ETH_AND_GALT;
  }

  function getApplication(uint256 _aId)
    external
    view
    returns(
      Status status,
      address applicationContract,
      bytes32 externalApplicationId,
      uint256 approvalTimeoutInitiatedAt,
      Action action,
      uint256 requiredApprovals,
      uint256 approvalCount
    )
  {
    Application storage a = verificationQueue[_aId];

    status = a.status;
    applicationContract = a.applicationContract;
    externalApplicationId = a.externalApplicationId;
    approvalTimeoutInitiatedAt = a.approvalTimeoutInitiatedAt;
    action = a.action;
    requiredApprovals = a.requiredConfirmations;
    approvalCount = a.approvalCount;
  }

  function getApplicationRewards(
    uint256 _aId
  )
    external
    view
    returns (
      Currency currency,
      uint256 totalPaidFee,
      uint256 verifiersReward,
      uint256 galtProtocolReward,
      uint256 verifierReward
    )
  {
    Rewards storage r = verificationQueue[_aId].rewards;

    return (
      verificationQueue[_aId].currency,
      r.totalPaidFee,
      r.verifiersReward,
      r.galtProtocolReward,
      r.verifierReward
    );
  }
}
