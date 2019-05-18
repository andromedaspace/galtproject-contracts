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
import "../PGGConfig.sol";
import "./AbstractArbitrationProposalManager.sol";
import "./interfaces/IProposalManager.sol";
import "../../interfaces/IGlobalGovernance.sol";


contract CreateGlobalProposalProposalManager is IProposalManager, AbstractArbitrationProposalManager {
  struct Proposal {
    address destination;
    uint256 value;
    bytes data;
    uint256 globalId;
    string description;
  }

  mapping(uint256 => Proposal) private _proposals;

  constructor(
    PGGConfig _governanceConfig
  )
    public
    AbstractArbitrationProposalManager(_governanceConfig)
  {
  }

  function propose(
    address _destination,
    uint256 _value,
    bytes calldata _data,
    string calldata _description
  )
    external
  {
    idCounter.increment();
    uint256 id = idCounter.current();

    _proposals[id] = Proposal({
      destination: _destination,
      value: _value,
      data: _data,
      globalId: 0,
      description: _description
    });

    emit NewProposal(id, msg.sender);
    _onNewProposal(id);

    ProposalVoting storage proposalVoting = _proposalVotings[id];

    proposalVoting.status = ProposalStatus.ACTIVE;
  }

  function _execute(uint256 _proposalId) internal {
    Proposal storage p = _proposals[_proposalId];

    p.globalId = IGlobalGovernance(governanceConfig.ggr().getGlobalGovernanceAddress()).propose(
      address(governanceConfig.getMultiSig()),
      p.destination,
      p.value,
      p.data
    );
  }

  function getThreshold() public view returns (uint256) {
    return governanceConfig.thresholds(governanceConfig.CREATE_GLOBAL_PROPOSAL_THRESHOLD());
  }

  function getProposal(
    uint256 _id
  )
    external
    view
    returns (
      address destination,
      uint256 value,
      uint256 globalId,
      bytes memory data,
      string memory description
    )
  {
    Proposal storage p = _proposals[_id];
    return (p.destination, p.value, p.globalId, p.data, p.description);
  }
}
