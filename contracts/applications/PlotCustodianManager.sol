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

pragma solidity 0.5.7;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "@galtproject/libs/contracts/traits/Statusable.sol";
import "../interfaces/ISpaceToken.sol";
import "../interfaces/ISplitMerge.sol";
import "../registries/SpaceCustodianRegistry.sol";
import "./AbstractOracleApplication.sol";
import "../registries/interfaces/ISpaceCustodianRegistry.sol";


contract PlotCustodianManager is AbstractOracleApplication, Statusable {
  using SafeMath for uint256;
  using ArraySet for ArraySet.AddressSet;

  bytes32 public constant PC_CUSTODIAN_ORACLE_TYPE = bytes32("PC_CUSTODIAN_ORACLE_TYPE");
  bytes32 public constant PC_AUDITOR_ORACLE_TYPE = bytes32("PC_AUDITOR_ORACLE_TYPE");

  bytes32 public constant CONFIG_MINIMAL_FEE_ETH = bytes32("PC_MINIMAL_FEE_ETH");
  bytes32 public constant CONFIG_MINIMAL_FEE_GALT = bytes32("PC_MINIMAL_FEE_GALT");
  bytes32 public constant CONFIG_PAYMENT_METHOD = bytes32("PC_PAYMENT_METHOD");
  bytes32 public constant CONFIG_PREFIX = bytes32("PC");

  // TODO: move values to the custodian registry
  uint256 public constant MODIFY_CUSTODIAN_LIMIT = 10;
  uint256 public constant TOTAL_CUSTODIAN_LIMIT = 10;

  enum ValidationStatus {
    NOT_EXISTS,
    PENDING,
    LOCKED
  }

  enum Action {
    ATTACH,
    DETACH
  }

  enum Choice {
    PENDING,
    APPROVE,
    REJECT
  }

  event LogApplicationStatusChanged(bytes32 applicationId, ApplicationStatus status);
  event LogValidationStatusChanged(bytes32 applicationId, bytes32 role, ValidationStatus status);
  event LogNewApplication(bytes32 id, address applicant);
  event Approve(uint256 approveCount, uint256 required);

  struct Application {
    bytes32 id;
    address multiSig;
    address applicant;
    address auditor;
    address escrowAddress;
    uint256 spaceTokenId;
    bool throughEscrow;
    string rejectMessage;

    Action action;
    Currency currency;
    ApplicationStatus status;

    bytes32[] custodianDocuments;

    ArraySet.AddressSet custodiansToModify;
    ArraySet.AddressSet acceptedCustodians;
    ArraySet.AddressSet lockedCustodians;

    Voting voting;
    Rewards rewards;
  }

  struct Voting {
    uint256 approveCount;

    uint256 required;

    // voters = unique(acceptedCustodians + lockedCustodians) + 1 auditor + 1 applicant
    ArraySet.AddressSet voters;
    mapping(address => bool) approvals;
  }

  struct Rewards {
    uint256 galtProtocolFee;
    // oraclesReward = custodianReward * N + auditorReward (with some chance of error)
    uint256 oraclesReward;
    uint256 totalCustodiansReward;
    uint256 custodianReward;
    uint256 auditorReward;

    bool galtProtocolFeePaidOut;
    bool auditorRewardPaidOut;
    mapping(address => bool) custodianRewardPaidOut;
  }

  mapping(bytes32 => Application) private applications;

  constructor () public {}

  function initialize(
    GaltGlobalRegistry _ggr
  )
    external
    isInitializer
  {
    ggr = _ggr;
  }

  function minimalApplicationFeeEth(address _multiSig) public view returns (uint256) {
    return uint256(applicationConfigValue(_multiSig, CONFIG_MINIMAL_FEE_ETH));
  }

  function minimalApplicationFeeGalt(address _multiSig) public view returns (uint256) {
    return uint256(applicationConfigValue(_multiSig, CONFIG_MINIMAL_FEE_GALT));
  }

  function paymentMethod(address _multiSig) public view returns (PaymentMethod) {
    return PaymentMethod(uint256(applicationConfigValue(_multiSig, CONFIG_PAYMENT_METHOD)));
  }

  function getOracleTypeShareKey(bytes32 _oracleType) public pure returns (bytes32) {
    return keccak256(abi.encode(CONFIG_PREFIX, "share", _oracleType));
  }

  /**
   * @dev Submit a new custodian management application from PlotEscrow contract
   */
  function submitApplicationFromEscrow(
    address _multiSig,
    uint256 _spaceTokenId,
    Action _action,
    address[] calldata _custodiansToModify,
    address _applicant,
    uint256 _applicationFeeInGalt
  )
    external
    payable
    returns (bytes32)
  {
//    require(isValidPlotEscrow(msg.sender), "Only trusted PlotEscrow allowed");
//    require(_applicant != address(0), "Should specify applicant");
//    require(ISpaceToken(ggr.getSpaceTokenAddress()).exists(_spaceTokenId), "SpaceToken doesn't exist");
//    require(isValidPlotEscrow(ggr.getSpaceToken().ownerOf(_spaceTokenId)), "PlotEscrow should own the token");
    //TODO: find the way to optimize gas
    require(
      isValidPlotEscrow(msg.sender) && _applicant != address(0) && ISpaceToken(ggr.getSpaceTokenAddress()).exists(_spaceTokenId) && isValidPlotEscrow(ggr.getSpaceToken().ownerOf(_spaceTokenId)),
      ""
    );

    return submitApplicationHelper(
      _multiSig,
      _spaceTokenId,
      _action,
      _applicant,
      _custodiansToModify,
      true,
      msg.sender,
      _applicationFeeInGalt
    );
  }

  /**
   * @dev Submit a new custodian management application
   * @param _spaceTokenId package SpaceToken ID
   * @param _action either ATTACH or DETACH custodian
   * @param _custodiansToModify which would be either pushed to the current ones or removed
   * @param _applicationFeeInGalt if GALT is application currency, 0 for ETH
   */
  function submit(
    address _multiSig,
    uint256 _spaceTokenId,
    Action _action,
    address[] calldata _custodiansToModify,
    uint256 _applicationFeeInGalt
  )
    external
    payable
    returns (bytes32)
  {
    require(ISpaceToken(ggr.getSpaceTokenAddress()).exists(_spaceTokenId), "SpaceToken doesn't exist");
    require(ggr.getSpaceToken().ownerOf(_spaceTokenId) == msg.sender, "Sender should own the token");

    return submitApplicationHelper(
      _multiSig,
      _spaceTokenId,
      _action,
      msg.sender,
      _custodiansToModify,
      false,
      address(0),
      _applicationFeeInGalt
    );
  }

  function submitApplicationHelper(
    address _multiSig,
    uint256 _spaceTokenId,
    Action _action,
    address _applicant,
    address[] memory _custodiansToModify,
    bool _throughEscrow,
    address _escrowAddress,
    uint256 _applicationFeeInGalt
  )
    internal
    returns (bytes32)
  {
    require(_custodiansToModify.length <= MODIFY_CUSTODIAN_LIMIT, "Too many custodians to modify");

    // Default is ETH
    Currency currency;
    uint256 fee;

    // ETH
    if (msg.value > 0) {
      require(_applicationFeeInGalt == 0, "Can't accept both ETH and GALT");
      require(msg.value >= minimalApplicationFeeEth(_multiSig), "Incorrect fee passed in");
      fee = msg.value;
    // GALT
    } else {
      require(msg.value == 0, "Can't accept both ETH and GALT");
      require(_applicationFeeInGalt >= minimalApplicationFeeGalt(_multiSig), "Incorrect fee passed in");
      ggr.getGaltToken().transferFrom(_applicant, address(this), _applicationFeeInGalt);
      fee = _applicationFeeInGalt;
      currency = Currency.GALT;
    }

    bytes32 _id = keccak256(
      abi.encodePacked(
        _spaceTokenId,
        blockhash(block.number - 1),
        applicationsArray.length
      )
    );

    require(applications[_id].status == ApplicationStatus.NOT_EXISTS, "Application already exists");

    Application storage a = applications[_id];

    a.multiSig = _multiSig;

    _storeCustodians(a, _spaceTokenId, _custodiansToModify, _action);

    a.status = ApplicationStatus.SUBMITTED;
    a.id = _id;
    a.throughEscrow = _throughEscrow;
    a.applicant = _applicant;
    a.currency = currency;
    a.spaceTokenId = _spaceTokenId;
    a.action = _action;
    a.escrowAddress = _escrowAddress;

    calculateAndStoreFee(a, fee);

    applicationsArray.push(_id);
    applicationsByApplicant[_applicant].push(_id);

    emit LogNewApplication(_id, _applicant);
    emit LogApplicationStatusChanged(_id, ApplicationStatus.SUBMITTED);

    return _id;
  }

  /**
   * @dev Resubmit an already reverted application
   * @param _aId application ID
   * @param _spaceTokenId package SpaceToken ID
   * @param _action either ATTACH or DETACH custodian
   * @param _custodiansToModify which would consider working on this application
   */
  function resubmit(
    bytes32 _aId,
    uint256 _spaceTokenId,
    Action _action,
    address[] calldata _custodiansToModify
  )
    external
    returns (bytes32)
  {
    Application storage a = applications[_aId];
    require(a.applicant == msg.sender, "Invalid applicant");

    require(a.status == ApplicationStatus.REVERTED, "Expect REVERTED status");
    require(ISpaceToken(ggr.getSpaceTokenAddress()).exists(_spaceTokenId), "SpaceToken doesn't exist");
    require(ggr.getSpaceToken().ownerOf(_spaceTokenId) == msg.sender, "Sender should own the token");

    a.custodiansToModify.clear();
    _storeCustodians(a, _spaceTokenId, _custodiansToModify, _action);

    a.spaceTokenId = _spaceTokenId;
    a.action = _action;
    a.acceptedCustodians.clear();
    a.lockedCustodians.clear();

    changeApplicationStatus(a, ApplicationStatus.SUBMITTED);
  }

  function _storeCustodians(
    Application storage _a,
    uint256 _spaceTokenId,
    address[] memory _custodiansToModify,
    Action _action
  )
    internal
  {
    uint256 len = _custodiansToModify.length;
    ISpaceCustodianRegistry registry = spaceCustodianRegistry();

    require((registry.spaceCustodianCount(_spaceTokenId) + len) < TOTAL_CUSTODIAN_LIMIT, "Exceed total custodian limit");

    for (uint256 i = 0; i < len; i++) {
      address custodian = _custodiansToModify[i];
      requireOracleActiveWithAssignedActiveOracleType(_a.multiSig, custodian, PC_CUSTODIAN_ORACLE_TYPE);

      if (_action == Action.ATTACH) {
        require(!registry.spaceCustodianAssigned(_spaceTokenId, custodian), "Custodian already locked a slot");
      } else {
        require(registry.spaceCustodianAssigned(_spaceTokenId, custodian), "Custodian doesn't have slot");
      }

      _a.custodiansToModify.add(custodian);
    }
  }

  /**
   * @dev Application can be reverted by a custodian
   * @param _aId application ID
   */
  function revert(bytes32 _aId) external {
    Application storage a = applications[_aId];
    requireOracleActiveWithAssignedActiveOracleType(a.multiSig, msg.sender, PC_CUSTODIAN_ORACLE_TYPE);

    require(
      a.status == ApplicationStatus.SUBMITTED || a.status == ApplicationStatus.ACCEPTED,
      "Expect SUBMITTED|ACCEPTED status");
    require(
      a.custodiansToModify.has(msg.sender) ||
      spaceCustodianRegistry().spaceCustodianAssigned(a.spaceTokenId, msg.sender),
      "Not valid custodian");

    changeApplicationStatus(a, ApplicationStatus.REVERTED);
  }

  /**
   * @dev The modifying custodians accept changes
   * @param _aId application ID
   */
  function accept(bytes32 _aId) external {
    Application storage a = applications[_aId];
    requireOracleActiveWithAssignedActiveOracleType(a.multiSig, msg.sender, PC_CUSTODIAN_ORACLE_TYPE);

    require(
      a.status == ApplicationStatus.SUBMITTED,
      "Expect SUBMITTED status");

    require(a.custodiansToModify.has(msg.sender), "Not in modifiers list");
    require(!a.acceptedCustodians.has(msg.sender), "Already accepted");

    a.acceptedCustodians.add(msg.sender);

    // TODO: add/replace with event
    applicationsByOracle[msg.sender].push(_aId);

    if (a.acceptedCustodians.size() == a.custodiansToModify.size()) {
      if (spaceCustodianRegistry().spaceCustodianCount(a.spaceTokenId) == 0) {
        changeApplicationStatus(a, ApplicationStatus.LOCKED);
      } else {
        changeApplicationStatus(a, ApplicationStatus.ACCEPTED);
      }
    }
  }

  /**
   * @dev Existing custodians lock application
   * @param _aId application ID
   */
  function lock(bytes32 _aId) external {
    Application storage a = applications[_aId];
    requireOracleActiveWithAssignedActiveOracleType(a.multiSig, msg.sender, PC_CUSTODIAN_ORACLE_TYPE);

    require(
      a.status == ApplicationStatus.ACCEPTED,
      "Expect ACCEPTED status");
    require(spaceCustodianRegistry().spaceCustodianAssigned(a.spaceTokenId, msg.sender), "Not in assigned list");
    require(!a.lockedCustodians.has(msg.sender), "Already locked");

    a.lockedCustodians.add(msg.sender);

    // TODO: add/replace with event
    applicationsByOracle[msg.sender].push(_aId);

    if (spaceCustodianRegistry().spaceCustodianCount(a.spaceTokenId) == a.lockedCustodians.size()) {
      changeApplicationStatus(a, ApplicationStatus.LOCKED);
    }
  }

  /**
   * @dev Attach SpaceToken to an application
   * @param _aId application ID
   */
  function attachToken(bytes32 _aId) external {
    Application storage a = applications[_aId];

    require(a.applicant == msg.sender, "Invalid applicant");

    ArraySet.AddressSet storage voters = a.voting.voters;

    require(a.status == ApplicationStatus.LOCKED, "Expect LOCKED status");
    ggr.getSpaceToken().transferFrom(a.throughEscrow ? a.escrowAddress : a.applicant, address(this), a.spaceTokenId);
    // TODO: assign values;

    // voters = unique(acceptedCustodians + lockedCustodians) + 1 auditor + 1 applicant
    uint256 votersCount = a.acceptedCustodians.size() + 2;

    address[] memory accepted = a.acceptedCustodians.elements();
    for (uint256 i = 0; i < accepted.length; i++) {
      voters.add(accepted[i]);
    }

    address[] memory current = a.lockedCustodians.elements();
    for (uint256 i = 0; i < current.length; i++) {
      if (!voters.has(current[i])) {
        voters.add(current[i]);
        votersCount++;
      }
    }

    voters.add(a.applicant);
    a.voting.required = votersCount;

    _calculateAndStoreCustodianRewards(a);

    changeApplicationStatus(a, ApplicationStatus.REVIEW);
  }

  /**
   * @dev Custodian attaches documents to the application.
   * Allows multiple calls. Each call replaces the previous document hashes array with a new one.
   *
   * @param _aId application ID
   * @param _documents to attach
   */
  function attachDocuments(
    bytes32 _aId,
    bytes32[] calldata _documents
  )
    external
  {
    Application storage a = applications[_aId];

    require(a.status == ApplicationStatus.REVIEW, "Expect REVIEW status");

    require(
      a.acceptedCustodians.has(msg.sender) ||
      a.lockedCustodians.has(msg.sender),
      "Only a custodian role allowed");

    requireOracleActiveWithAssignedActiveOracleType(a.multiSig, msg.sender, PC_CUSTODIAN_ORACLE_TYPE);

    address[] memory voters = a.voting.voters.elements();
    for (uint256 i = 0; i < voters.length; i++) {
      a.voting.approvals[voters[i]] = false;
    }

    a.voting.approveCount = 0;

    a.custodianDocuments = _documents;
  }

  /**
   * @dev Auditor lock application
   * @param _aId application ID
   */
  function auditorLock(bytes32 _aId) external {
    Application storage a = applications[_aId];
    requireOracleActiveWithAssignedActiveOracleType(a.multiSig, msg.sender, PC_AUDITOR_ORACLE_TYPE);

    require(
      a.status == ApplicationStatus.REVIEW,
      "Expect REVIEW status");
    require(a.auditor == address(0), "Not in assigned list");

    // TODO: add/replace with event
    applicationsByOracle[msg.sender].push(_aId);

    a.auditor = msg.sender;
    a.voting.voters.add(msg.sender);
  }

  /**
   * @dev Custodian, Auditor and Applicant approve application.
   * Requires all the participants to call this method in order to confirm that they are agree on the given terms.
   * @param _aId application ID
   */
  function approve(bytes32 _aId) external {
    Application storage a = applications[_aId];
    Voting storage v = a.voting;

//    require(a.status == ApplicationStatus.REVIEW, "Expect REVIEW status");
//    require(v.voters.has(msg.sender), "Not in voters list");
//    require(v.approvals[msg.sender] == false, "Already approved");
    // TODO: return the above requires back instead of the follow one
    require(a.status == ApplicationStatus.REVIEW && v.voters.has(msg.sender) && v.approvals[msg.sender] == false);

    v.approveCount += 1;
    v.approvals[msg.sender] = true;

    emit Approve(v.approveCount, v.required);

    if (v.approveCount == v.required) {
      if (a.action == Action.DETACH) {
        spaceCustodianRegistry().detach(a.spaceTokenId, a.custodiansToModify.elements(), a.custodianDocuments);
      } else {
        spaceCustodianRegistry().attach(a.spaceTokenId, a.custodiansToModify.elements(), a.custodianDocuments);
      }

      changeApplicationStatus(a, ApplicationStatus.APPROVED);
    }
  }

  /**
   * @dev Reject the application by a custodian if he changed his mind or the application looks suspicious.
   * @param _aId application ID
   */
  function reject(
    bytes32 _aId,
    string calldata _message
  )
    external
  {
    Application storage a = applications[_aId];

    require(a.status == ApplicationStatus.REVIEW, "Expect REVIEW status");

    require(
      a.acceptedCustodians.has(msg.sender) ||
      a.lockedCustodians.has(msg.sender),
      "Only a custodian role allowed");

    require(
      a.acceptedCustodians.has(msg.sender) || a.lockedCustodians.has(msg.sender) || a.auditor == msg.sender,
      "Only custodians/auditor allowed");
    require(a.auditor != address(0), "Auditor should be assigned first");

    a.rejectMessage = _message;

    changeApplicationStatus(a, ApplicationStatus.REJECTED);
  }

  /**
   * @dev Withdraw the attached SpaceToken back by the applicant
   * @param _aId application ID
   */
  function withdrawToken(bytes32 _aId) external {
    Application storage a = applications[_aId];

    require(a.status == ApplicationStatus.APPROVED, "Expect APPROVED status");

    if (a.throughEscrow) {
      require(isValidPlotEscrow(msg.sender), "Only plotEscrow allowed");
    } else {
      require(msg.sender == a.applicant, "Invalid applicant");
    }

    ggr.getSpaceToken().transferFrom(address(this), msg.sender, a.spaceTokenId);

    changeApplicationStatus(a, ApplicationStatus.COMPLETED);
  }

  /**
   * @dev Close the application by the applicant without attaching/detaching a custodian
   * @param _aId application ID
   */
  function close(bytes32 _aId) external {
    Application storage a = applications[_aId];
    require(
      a.applicant == msg.sender,
      "Invalid applicant");

    require(
      a.status == ApplicationStatus.REJECTED ||
      a.status == ApplicationStatus.LOCKED,
      "Expect REJECTED/LOCKED status");

    if (a.status == ApplicationStatus.REJECTED) {
      ggr.getSpaceToken().transferFrom(address(this), msg.sender, a.spaceTokenId);
    }

    changeApplicationStatus(a, ApplicationStatus.CLOSED);
  }

  /**
   * @dev Custodians and auditor claim their rewards
   * @param _aId application ID
   */
  function claimOracleReward(
    bytes32 _aId
  )
    external
  {
    Application storage a = applications[_aId];

    arbitrationConfig(a.multiSig)
      .getOracles()
      .requireOracleActive(msg.sender);

    require(
      a.status == ApplicationStatus.COMPLETED ||
      a.status == ApplicationStatus.CLOSED,
      "Expect COMPLETED/CLOSED status");

    uint256 reward;

    if (msg.sender == a.auditor) {
      require(a.rewards.auditorRewardPaidOut == false, "Reward is already paid out");
      reward = a.rewards.auditorReward;
      a.rewards.auditorRewardPaidOut = true;
    } else {
      require(
        a.acceptedCustodians.has(msg.sender) || a.lockedCustodians.has(msg.sender),
        "Not a participating custodian");

      require(a.rewards.custodianRewardPaidOut[msg.sender] == false, "Reward is already paid out");
      a.rewards.custodianRewardPaidOut[msg.sender] = true;

      reward = a.rewards.custodianReward;
    }

    require(reward > 0, "Reward is 0");

    _assignGaltProtocolFee(a);

    if (a.currency == Currency.ETH) {
      msg.sender.transfer(reward);
    } else {
      ggr.getGaltToken().transfer(msg.sender, reward);
    }
  }

  function _assignGaltProtocolFee(Application storage _a) internal {
    if (_a.rewards.galtProtocolFeePaidOut == false) {
      if (_a.currency == Currency.ETH) {
        protocolFeesEth = protocolFeesEth.add(_a.rewards.galtProtocolFee);
      } else if (_a.currency == Currency.GALT) {
        protocolFeesGalt = protocolFeesGalt.add(_a.rewards.galtProtocolFee);
      }

      _a.rewards.galtProtocolFeePaidOut = true;
    }
  }

  // NOTICE: in case 100 ether / 3, each arbitrator will receive 33.33... ether and 1 wei will remain on contract
  function _calculateAndStoreCustodianRewards(Application storage a) internal {
    // voters = 1 applicant + oracles (1 auditor will be pushed later)
    // at the moment only oracles and an applicant are pushed here
    uint256 len = a.voting.voters.size();
    assert(len > 0);

    uint256 rewardSize = a.rewards.totalCustodiansReward.div(len);

    a.rewards.custodianReward = rewardSize;
  }

  function isValidPlotEscrow(address _plotEscrow) internal view returns (bool) {
    // TODO: add interaction with ApplicationRegistry
    return true;
  }

  function spaceCustodianRegistry() internal view returns (ISpaceCustodianRegistry) {
    return ISpaceCustodianRegistry(ggr.getSpaceCustodianRegistryAddress());
  }

  function getApplicationById(
    bytes32 _id
  )
    external
    view
    returns (
      address applicant,
      uint256 spaceTokenId,
      address[] memory custodiansToModify,
      address[] memory acceptedCustodians,
      address[] memory lockedCustodians,
      bytes32[] memory custodianDocuments,
      address auditor,
      bool throughEscrow,
      ApplicationStatus status,
      Currency currency,
      Action action
    )
  {
    Application storage m = applications[_id];

    return (
      m.applicant,
      m.spaceTokenId,
      m.custodiansToModify.elements(),
      m.acceptedCustodians.elements(),
      m.lockedCustodians.elements(),
      m.custodianDocuments,
      m.auditor,
      m.throughEscrow,
      m.status,
      m.currency,
      m.action
    );
  }

  function getApplicationRewards(
    bytes32 _id
  )
    external
    view
    returns (
      Currency currency,
      uint256 galtProtocolFee,
      uint256 oraclesReward,
      uint256 totalCustodiansReward,
      uint256 custodianReward,
      uint256 auditorReward,
      bool galtProtocolFeePaidOut,
      bool auditorRewardPaidOut
    )
  {
    Rewards storage r = applications[_id].rewards;

    return (
      applications[_id].currency,
      r.galtProtocolFee,
      r.oraclesReward,
      r.totalCustodiansReward,
      r.custodianReward,
      r.auditorReward,
      r.galtProtocolFeePaidOut,
      r.auditorRewardPaidOut
    );
  }

  function getApplicationCustodian(
    bytes32 _aId,
    address _custodian
  )
    external
    view
    returns (
      bool approved,
      bool rewardPaidOut,
      bool involved
    )
  {
    Application storage a = applications[_aId];

    involved = (
      a.acceptedCustodians.has(_custodian) ||
      a.lockedCustodians.has(_custodian) || a.custodiansToModify.has(_custodian));

    approved = a.voting.approvals[_custodian];
    rewardPaidOut = a.rewards.custodianRewardPaidOut[_custodian];
  }

  function getApplicationVoting(bytes32 _aId)
    external
    view
    returns (
      uint256 approveCount,
      uint256 required,
      address[] memory voters,
      bool currentAddressApproved
    )
  {
    Voting storage v = applications[_aId].voting;

    return (
      v.approveCount,
      v.required,
      v.voters.elements(),
      v.approvals[msg.sender]
    );
  }

  function changeApplicationStatus(
    Application storage _a,
    ApplicationStatus _status
  )
    internal
  {
    emit LogApplicationStatusChanged(_a.id, _status);

    _a.status = _status;
  }

  function calculateAndStoreFee(
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

    assert(share > 0);
    assert(share <= 100);

    uint256 galtProtocolFee = share.mul(_fee).div(100);
    uint256 oraclesReward = _fee.sub(galtProtocolFee);

    assert(oraclesReward.add(galtProtocolFee) == _fee);

    uint256 custodiansShare = oracleTypeShare(_a.multiSig, PC_CUSTODIAN_ORACLE_TYPE);
    uint256 auditorShare = oracleTypeShare(_a.multiSig, PC_AUDITOR_ORACLE_TYPE);

    assert(custodiansShare + auditorShare == 100);

    _a.rewards.galtProtocolFee = galtProtocolFee;
    _a.rewards.oraclesReward = oraclesReward;

    _a.rewards.totalCustodiansReward = _a
      .rewards
      .oraclesReward
      .mul(custodiansShare)
      .div(100);

    _a.rewards.auditorReward = oraclesReward.sub(_a.rewards.totalCustodiansReward);
  }
}
