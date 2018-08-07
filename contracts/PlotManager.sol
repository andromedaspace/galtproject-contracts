pragma solidity 0.4.24;
pragma experimental "v0.5.0";

import "zos-lib/contracts/migrations/Initializable.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./SpaceToken.sol";
import "./SplitMerge.sol";

contract PlotManager is Initializable, Ownable {
  enum ApplicationStatuses { NOT_EXISTS, NEW, SWAPPED, SUBMITTED, APPROVED, REJECTED }

  event ApplicationStatusChanged(bytes32 application, uint256 status);
  event NewApplication(bytes32 id, address applicant);
  event NewPackMinted(bytes32 spaceTokenId, bytes32 applicationId);
  event NewGeohashMinted(bytes32 spaceTokenId, bytes32 applicationId);

  struct Application {
    bytes32 id;
    address applicant;
    address validator;
    bytes32 credentialsHash;
    bytes32 ledgerIdentifier;
    uint256 packageToken;
    uint8 precision;
    bytes2 country;
    uint256[] vertices;
    uint256[] geohashTokens;
    ApplicationStatuses status;
  }

  struct Validator {
    bytes32 name;
    bytes2 country;
  }

  mapping(bytes32 => Application) applications;
  mapping(address => Validator) validators;
  bytes32[] applicationsArray;
  address[] validatorsArray;
  uint256 validationFee;

  SpaceToken public spaceToken;
  SplitMerge public splitMerge;

  function initialize(
    SpaceToken _spaceToken,
    SplitMerge _splitMerge
  )
    public
    isInitializer
  {
    owner = msg.sender;
    spaceToken = _spaceToken;
    splitMerge = _splitMerge;
    validationFee = 1 ether;
  }

  modifier onlyApplicant(bytes32 _aId) {
    Application storage a = applications[_aId];

    require(a.applicant == msg.sender);
    require(splitMerge != address(0));

    _;
  }

  function addValidator(address) public onlyOwner {

  }

  function removeValidator(address _validator, bytes2 country) public onlyOwner {

  }

  function applyForPlotOwnership(
    uint256[] _vertices,
    bytes32 _credentialsHash,
    bytes32 _ledgerIdentifier,
    bytes2 _country,
    uint8 _precision
  )
    public
    returns (bytes32)
  {
    require(_precision > 5, "Precision should be greater than 5");
    require(_vertices.length >= 3, "Number of vertices should be equal or greater than 3");
    require(_vertices.length < 51, "Number of vertices should be equal or less than 50");

    for (uint8 i = 0; i < _vertices.length; i++) {
      require(_vertices[i] > 0, "Vertex should not be zero");
    }

    Application memory a;
    bytes32 _id = keccak256(abi.encodePacked(_vertices[0], _vertices[1], _credentialsHash));

    a.status = ApplicationStatuses.NEW;
    a.id = _id;
    a.applicant = msg.sender;
    a.vertices = _vertices;
    a.country = _country;
    a.credentialsHash = _credentialsHash;
    a.ledgerIdentifier = _ledgerIdentifier;
    a.precision = _precision;

    applications[_id] = a;

    emit NewApplication(_id, msg.sender);
    return _id;
  }

  function mintPack(bytes32 _aId) public onlyApplicant(_aId) {
    // TODO: prevent double mint
    Application storage a = applications[_aId];
    uint256 t = spaceToken.mintPack(splitMerge);
    a.packageToken = t;

    emit NewPackMinted(bytes32(t), _aId);
  }

  function pushGeohashes(bytes32 _aId, uint256[] _geohashes) public onlyApplicant(_aId) {
    require(_geohashes.length < 40, "Able to handle up to 40 geohashes only");
    Application storage a = applications[_aId];

    for (uint8 i = 0; i < _geohashes.length; i++) {
      uint256 g = spaceToken.geohashToTokenId(_geohashes[i]);
      spaceToken.mint(address(this), g);
      a.geohashTokens.push(g);
      emit NewGeohashMinted(bytes32(g), _aId);
    }
  }

  function swapTokens(bytes32 _aId) public onlyApplicant(_aId) {
    Application storage a = applications[_aId];

    require(a.applicant == msg.sender);
    require(a.status == ApplicationStatuses.NEW);
    require(splitMerge != address(0));

    splitMerge.swapTokens(a.packageToken, a.geohashTokens);
    a.status = ApplicationStatuses.SWAPPED;
  }

  function submit(bytes32 _aId) public payable onlyApplicant(_aId) {
    Application storage a = applications[_aId];

    require(msg.value == validationFee);

    a.status = ApplicationStatuses.SUBMITTED;
  }


  function getPlotApplication(
    bytes32 _id
  )
    public
    view
    returns (
      address applicant,
      uint256[] vertices,
      uint256 packageToken,
      uint256[] geohashTokens,
      bytes32 credentiaslHash,
      ApplicationStatuses status,
      uint8 precision,
      bytes2 country,
      bytes32 ledgerIdentifier
    )
  {
    require(applications[_id].status != ApplicationStatuses.NOT_EXISTS, "Application doesn't exist");

    Application storage m = applications[_id];

    return (
      m.applicant,
      m.vertices,
      m.packageToken,
      m.geohashTokens,
      m.credentialsHash,
      m.status,
      m.precision,
      m.country,
      m.ledgerIdentifier
    );
  }
}
