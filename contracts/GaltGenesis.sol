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

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./GaltToken.sol";
import "./GaltDex.sol";

contract GaltGenesis is Ownable {
  using SafeMath for uint256;

  GaltToken galtToken;
  GaltDex galtDex;

  uint256 public totalGalt;

  mapping(address => uint256) public paidByAddress;
  uint256 public totalPaid;

  mapping(address => bool) public claimedByAddress;

  uint256 public openingTime;
  uint256 public closingTime;
  bool public finished;

  event Started(uint256 openingTime, uint256 closingTime, uint256 totalGalt);
  event Paid(address account, uint256 ethValue);
  event Claimed(address account, uint256 galtValue);
  event Finished(uint256 ethBalance, uint256 finishingTime);

  constructor (GaltToken _galtToken, GaltDex _galtDex) public {
    owner = msg.sender;
    galtToken = _galtToken;
    galtDex = _galtDex;
  }

  function start(uint256 period) external onlyOwner {
    require(openingTime == 0, "Already started");
    require(galtToken.balanceOf(address(this)) > 0, "GaltGensis require GALT to start");

    openingTime = block.timestamp;
    closingTime = openingTime.add(period);
    totalGalt = galtToken.balanceOf(address(this));

    emit Started(openingTime, closingTime, totalGalt);
  }

  function finish() external {
    require(block.timestamp >= closingTime, "To soon");
    finished = true;

    emit Finished(address(this).balance, block.timestamp);

    address(galtDex).transfer(address(this).balance);
  }

  function pay() public payable {
    require(!finished, "Finished");
    require(closingTime > block.timestamp, "Current timestamp more then closingTime");
    require(msg.value > 0, "Ether amount cant be null");

    paidByAddress[msg.sender] = paidByAddress[msg.sender].add(msg.value);
    totalPaid = totalPaid.add(msg.value);

    emit Paid(msg.sender, msg.value);
  }

  function claim() public {
    require(finished, "Not finished yet");
    require(!claimedByAddress[msg.sender], "Already claimed");
    require(paidByAddress[msg.sender] > 0, "Nothing to claim");

    uint256 galtBalanceOfGenesis = galtToken.balanceOf(address(this));

    uint256 claimAmount = paidByAddress[msg.sender].mul(totalGalt).div(totalPaid);
    if (claimAmount > galtBalanceOfGenesis) {
      claimAmount = galtBalanceOfGenesis;
    }
    galtToken.transfer(msg.sender, claimAmount);

    claimedByAddress[msg.sender] = true;

    emit Claimed(msg.sender, claimAmount);
  }

  function() external payable {
    pay();
  }
}
