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

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "./AbstractApplication.sol";
import "./SpaceToken.sol";
import "./Validators.sol";
import "./collections/ArraySet.sol";
import "./ValidatorStakes.sol";
import "./ValidatorStakesMultiSig.sol";


contract ClaimManager is AbstractApplication {
  using SafeMath for uint256;
  using ArraySet for ArraySet.AddressSet;

  // `ClaimManager` keccak256 hash
  bytes32 public constant APPLICATION_TYPE = 0x6cdf6ab5991983536f64f626597a53b1a46773aa1473467b6d9d9a305b0a03ef;

  // `CM_JUROR` bytes32 representation hash
  bytes32 public constant CM_AUDITOR = 0x434d5f41554449544f5200000000000000000000000000000000000000000000;

  // `bytes4(keccak256('transfer(address,uint256)'))`
  bytes4 public constant ERC20_TRANSFER_SIGNATURE = 0xa9059cbb;

  enum ApplicationStatus {
    NOT_EXISTS,
    SUBMITTED,
    APPROVED,
    REJECTED,
    REVERTED
  }

  enum Action {
    APPROVE,
    REJECT
  }

  event ClaimStatusChanged(bytes32 applicationId, ApplicationStatus status);
  event NewClaim(bytes32 id, address applicant);
  event ValidatorSlotTaken(bytes32 claimId, uint256 slotsTaken, uint256 totalSlots);
  event NewProposal(bytes32 claimId, bytes32 proposalId, Action action, address proposer);
  event NewMessage(bytes32 claimId, uint256 messageId);

  struct Claim {
    bytes32 id;
    address applicant;
    address beneficiary;
    uint256 amount;
    bytes32 chosenProposal;
    uint256 messageCount;
    uint256 m;
    uint256 n;

    ApplicationStatus status;
    FeeDetails fees;

    mapping(bytes32 => Proposal) proposalDetails;
    mapping(uint256 => Message) messages;
    mapping(address => bytes32) votes;
    bytes32[] attachedDocuments;

    bytes32[] proposals;
    ArraySet.AddressSet validators;
  }

  struct FeeDetails {
    Currency currency;
    uint256 validatorsReward;
    uint256 validatorReward;
    uint256 galtSpaceReward;
    bool galtSpaceRewardPaidOut;
    mapping(address => bool) validatorRewardPaidOut;
  }

  struct Proposal {
    bytes32 id;
    Action action;
    ArraySet.AddressSet votesFor;
    address from;
    string message;
    uint256 amount;
    address[] validators;
    bytes32[] roles;
    uint256[] fines;
  }

  struct Message {
    uint256 id;
    uint256 timestamp;
    address from;
    string text;
  }

  mapping(bytes32 => Claim) claims;

  // validator count required to
  uint256 public n;

  // total validator count able to lock the claim
  uint256 public m;

  ValidatorStakes validatorStakes;
  ValidatorStakesMultiSig validatorStakesMultiSig;

  modifier onlyValidSuperValidator() {
    validators.requireValidatorActiveWithAssignedActiveRole(msg.sender, CM_AUDITOR);

    _;
  }

  constructor () public {}

  function setNofM(uint256 _n, uint256 _m) external onlyOwner {
    require(2 <= _n, "Should satisfy `2 <= n`");
    require(_n <= _m, "Should satisfy `n <= m`");

    n = _n;
    m = _m;
  }

  function initialize(
    Validators _validators,
    ERC20 _galtToken,
    ValidatorStakes _validatorStakes,
    ValidatorStakesMultiSig _validatorStakesMultiSig,
    address _galtSpaceRewardsAddress
  )
    public
    isInitializer
  {
    owner = msg.sender;

    validators = _validators;
    galtToken = _galtToken;
    validatorStakes = _validatorStakes;
    validatorStakesMultiSig = _validatorStakesMultiSig;
    galtSpaceRewardsAddress = _galtSpaceRewardsAddress;

    n = 3;
    m = 5;

    // Default values for revenue shares and application fees
    // Override them using one of the corresponding setters
    minimalApplicationFeeInEth = 1;
    minimalApplicationFeeInGalt = 10;
    galtSpaceEthShare = 33;
    galtSpaceGaltShare = 33;
    paymentMethod = PaymentMethod.ETH_AND_GALT;
  }

  /**
   * @dev Submit a new claim.
   *
   * @param _beneficiary for refund
   * @param _amount of claim
   * @param _documents with details
   * @param _applicationFeeInGalt or 0 for ETH payment method
   * @return new claim id
   */
  function submit(
    address _beneficiary,
    uint256 _amount,
    bytes32[] _documents,
    uint256 _applicationFeeInGalt
  )
    external
    payable
    returns (bytes32)
  {
    // Default is ETH
    Currency currency;
    uint256 fee;

    // ETH
    if (msg.value > 0) {
      require(_applicationFeeInGalt == 0, "Could not accept both ETH and GALT");
      require(msg.value >= minimalApplicationFeeInEth, "Incorrect fee passed in");
      fee = msg.value;
    // GALT
    } else {
      require(msg.value == 0, "Could not accept both ETH and GALT");
      require(_applicationFeeInGalt >= minimalApplicationFeeInGalt, "Incorrect fee passed in");
      galtToken.transferFrom(msg.sender, address(this), _applicationFeeInGalt);
      fee = _applicationFeeInGalt;
      currency = Currency.GALT;
    }

    Claim memory c;
    bytes32 id = keccak256(
      abi.encodePacked(
        msg.sender,
        _beneficiary,
        _documents,
        blockhash(block.number),
        applicationsArray.length
      )
    );

    require(claims[id].status == ApplicationStatus.NOT_EXISTS, "Claim already exists");

    c.status = ApplicationStatus.SUBMITTED;
    c.id = id;
    c.amount = _amount;
    c.beneficiary = _beneficiary;
    c.applicant = msg.sender;
    c.attachedDocuments = _documents;
    c.fees.currency = currency;
    c.n = n;
    c.m = m;

    calculateAndStoreFee(c, fee);

    claims[id] = c;

    applicationsArray.push(id);
    applicationsByAddresses[msg.sender].push(id);

    emit NewClaim(id, msg.sender);
    emit ClaimStatusChanged(id, ApplicationStatus.SUBMITTED);

    return id;
  }

  /**
   * @dev Super-Validator locks a claim to work on
   * @param _cId Claim ID
   */
  function lock(bytes32 _cId) external onlyValidSuperValidator {
    Claim storage c = claims[_cId];

    require(c.status == ApplicationStatus.SUBMITTED, "SUBMITTED claim status required");
    require(!c.validators.has(msg.sender), "Validator has already locked the application");
    require(c.validators.size() < m, "All validator slots are locked");

    c.validators.add(msg.sender);

    emit ValidatorSlotTaken(_cId, c.validators.size(), m);
  }

  /**
   * @dev Super-Validator makes approve proposal
   * @param _cId Claim ID
   */
  function proposeApproval(bytes32 _cId, string _msg, uint256 _amount, address[] _a, bytes32[] _r, uint256[] _f) external {
    require(_a.length == _r.length, "Address/Role arrays should be equal");
    require(_r.length == _f.length, "Role/Fine arrays should be equal");

    require(_a.length > 0, "Accused validators array should contain at leas one element");

    Claim storage c = claims[_cId];

    require(c.status == ApplicationStatus.SUBMITTED, "SUBMITTED claim status required");
    require(c.validators.has(msg.sender) == true, "Validator not in locked list");

    require(validators.validatorsHaveRolesAssigned(_a, _r), "Some roles are invalid");

    bytes32 id = keccak256(abi.encode(_cId, _msg, _a, _r, _f, msg.sender));
    require(c.proposalDetails[id].from == address(0), "Proposal already exists");

    Proposal memory p;

    p.id = id;
    p.from = msg.sender;
    p.action = Action.APPROVE;
    p.message = _msg;
    p.amount = _amount;
    p.validators = _a;
    p.roles = _r;
    p.fines = _f;

    c.proposalDetails[id] = p;
    c.proposals.push(id);

    // validator immediately votes for the proposal
    _voteFor(c, id);
    // as we have minimum n equal 2, a brand new proposal could not be executed in this step

    emit NewProposal(_cId, id, Action.APPROVE, msg.sender);
  }

  /**
   * @dev Super-Validator makes reject proposal
   * @param _cId Claim ID
   */
  function proposeReject(bytes32 _cId, string _msg) external {
    Claim storage c = claims[_cId];

    require(c.status == ApplicationStatus.SUBMITTED, "SUBMITTED claim status required");
    require(c.validators.has(msg.sender) == true, "Validator not in locked list");

    bytes32 id = keccak256(abi.encode(_cId, _msg, msg.sender));
    require(c.proposalDetails[id].from == address(0), "Proposal already exists");

    Proposal memory p;

    p.from = msg.sender;
    p.message = _msg;
    p.action = Action.REJECT;
    p.id = id;

    c.proposalDetails[id] = p;
    c.proposals.push(id);

    // validator immediately votes for the proposal
    _voteFor(c, id);
    // as we have minimum n equal 2, a brand new proposal could not be executed in this step

    emit NewProposal(_cId, id, Action.REJECT, msg.sender);
  }

  /**
   * @dev Super-Validator votes for a proposal
   * @param _cId Claim ID
   * @param _pId Proposal ID
   */
  function vote(bytes32 _cId, bytes32 _pId) external {
    Claim storage c = claims[_cId];

    require(c.status == ApplicationStatus.SUBMITTED, "SUBMITTED claim status required");
    require(c.validators.has(msg.sender) == true, "Validator not in locked list");

    Proposal storage p = c.proposalDetails[_pId];

    require(p.from != address(0), "Proposal doesn't exists");

    _voteFor(c, _pId);

    if (p.votesFor.size() == c.n) {
      c.chosenProposal = _pId;
      calculateAndStoreAuditorRewards(c);

      if (p.action == Action.APPROVE) {
        changeSaleOrderStatus(c, ApplicationStatus.APPROVED);
        validatorStakes.slash(p.validators, p.roles, p.fines);

        validatorStakesMultiSig.proposeTransaction(
          galtToken,
          0x0,
          abi.encodeWithSelector(ERC20_TRANSFER_SIGNATURE, c.beneficiary, p.amount)
        );
      } else {
        changeSaleOrderStatus(c, ApplicationStatus.REJECTED);
      }
    }
  }

  function claimValidatorReward(bytes32 _cId) external {
    Claim storage c = claims[_cId];

    require(
      c.status == ApplicationStatus.APPROVED || c.status == ApplicationStatus.REJECTED,
      "Application status should be APPROVED or REJECTED");
    require(c.validators.has(msg.sender) == true, "Validator not in locked list");
    require(c.fees.validatorRewardPaidOut[msg.sender] == false);
    validators.requireValidatorActiveWithAssignedActiveRole(msg.sender, CM_AUDITOR);

    c.fees.validatorRewardPaidOut[msg.sender] = true;

    if (c.fees.currency == Currency.ETH) {
      msg.sender.transfer(c.fees.validatorReward);
    } else if (c.fees.currency == Currency.GALT) {
      galtToken.transfer(msg.sender, c.fees.validatorReward);
    }
  }

  function claimGaltSpaceReward(bytes32 _cId) external {
    require(msg.sender == galtSpaceRewardsAddress, "The method call allowed only for galtSpace address");

    Claim storage c = claims[_cId];

    /* solium-disable-next-line */
    require(
      c.status == ApplicationStatus.APPROVED || c.status == ApplicationStatus.REJECTED,
      "Application status should be APPROVED or REJECTED");

    require(c.fees.galtSpaceReward > 0, "Reward is 0");
    require(c.fees.galtSpaceRewardPaidOut == false, "Reward is already paid out");

    c.fees.galtSpaceRewardPaidOut = true;

    if (c.fees.currency == Currency.ETH) {
      msg.sender.transfer(c.fees.galtSpaceReward);
    } else if (c.fees.currency == Currency.GALT) {
      galtToken.transfer(msg.sender, c.fees.galtSpaceReward);
    } else {
      revert("Unknown currency");
    }
  }

  function pushMessage(bytes32 _cId, string _text) external {
    Claim storage c = claims[_cId];

    require(c.status == ApplicationStatus.SUBMITTED, "SUBMITTED claim status required");
    require(c.validators.has(msg.sender) == true || c.applicant == msg.sender, "Allowed only to an applicant or a validator");

    uint256 id = c.messageCount;
    c.messages[id] = Message(id, block.timestamp, msg.sender, _text);
    c.messageCount = id + 1;

    emit NewMessage(_cId, id);
  }

  function _voteFor(Claim storage _c, bytes32 _pId) internal {
    Proposal storage _p = _c.proposalDetails[_pId];

    if (_c.votes[msg.sender] != 0x0) {
      _c.proposalDetails[_c.votes[msg.sender]].votesFor.remove(msg.sender);
    }

    _c.votes[msg.sender] = _p.id;
    _p.votesFor.add(msg.sender);
  }

  function calculateAndStoreFee(
    Claim memory _c,
    uint256 _fee
  )
    internal
  {
    uint256 share;

    if (_c.fees.currency == Currency.ETH) {
      share = galtSpaceEthShare;
    } else {
      share = galtSpaceGaltShare;
    }

    uint256 galtSpaceReward = share.mul(_fee).div(100);
    uint256 validatorsReward = _fee.sub(galtSpaceReward);

    assert(validatorsReward.add(galtSpaceReward) == _fee);

    _c.fees.validatorsReward = validatorsReward;
    _c.fees.galtSpaceReward = galtSpaceReward;
  }

  // NOTICE: in case 100 ether / 3, each validator will receive 33.33... ether and 1 wei will remain on contract
  function calculateAndStoreAuditorRewards (Claim storage c) internal {
    uint256 len = c.validators.size();
    uint256 rewardSize = c.fees.validatorsReward.div(len);

    c.fees.validatorReward = rewardSize;
  }

  function changeSaleOrderStatus(
    Claim storage _claim,
    ApplicationStatus _status
  )
    internal
  {
    emit ClaimStatusChanged(_claim.id, _status);

    _claim.status = _status;
  }

  /** GETTERS **/
  function claim(
    bytes32 _cId
  )
    external
    returns (
      bytes32 id,
      address applicant,
      address beneficiary,
      uint256 amount,
      bytes32[] attachedDocuments,
      address[] validators,
      uint256 slotsTaken,
      uint256 slotsThreshold,
      uint256 totalSlots,
      uint256 messageCount,
      ApplicationStatus status
    )
  {
    Claim storage c = claims[_cId];

    return (
      c.id,
      c.applicant,
      c.beneficiary,
      c.amount,
      c.attachedDocuments,
      c.validators.elements(),
      c.validators.size(),
      c.n,
      m,
      c.messageCount,
      c.status
    );
  }

  function getClaimFees(
    bytes32 _cId
  )
    external
    returns (
      Currency currency,
      uint256 validatorsReward,
      uint256 galtSpaceReward,
      uint256 validatorReward
    )
  {
    FeeDetails storage f = claims[_cId].fees;

    return (
      f.currency,
      f.validatorsReward,
      f.galtSpaceReward,
      f.validatorReward
    );
  }

  function getAllClaims() external view returns (bytes32[]) {
    return applicationsArray;
  }

  function getClaimsByAddress(address _applicant) external view returns (bytes32[]) {
    return applicationsByAddresses[_applicant];
  }

  function getClaimsByValidator(address _applicant) external view returns (bytes32[]) {
    return applicationsByValidator[_applicant];
  }

  function getProposals(bytes32 _cId) external view returns (bytes32[]) {
    return claims[_cId].proposals;
  }

  function getMessage(
    bytes32 _cId,
    uint256 _mId
  )
    external
    view
    returns (
      uint256 timestamp,
      address from,
      string text
    )
  {
    Message storage message = claims[_cId].messages[_mId];

    return (
      message.timestamp,
      message.from,
      message.text
    );
  }

  /*
   * @dev Get Proposal ID the validator voted for
   * @param _cId Claim ID
   * @param _v validator address
   */
  function getVotedFor(bytes32 _cId, address _v) external view returns (bytes32) {
    return claims[_cId].votes[_v];
  }

  function getProposal(
    bytes32 _cId,
    bytes32 _pId
  )
    external
    view
    returns (
      Action action,
      bytes32 id,
      address from,
      string message,
      address[] votesFor,
      uint256 votesSize,
      address[] validators,
      bytes32[] roles,
      uint256[] fines
    )
  {
    Proposal storage p = claims[_cId].proposalDetails[_pId];

    return (
      p.action,
      _pId,
      p.from,
      p.message,
      p.votesFor.elements(),
      p.votesFor.size(),
      p.validators,
      p.roles,
      p.fines
    );
  }
}
