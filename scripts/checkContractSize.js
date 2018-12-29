const fs = require('fs');

console.log('\nSize limit is about', 24577, '\n');
checkSize('AbstractApplication');
checkSize('ArraySet');
checkSize('ArbitratorMultiSig');
checkSize('ArbitratorVoting');
checkSize('Auditors');
checkSize('ClaimManager');
checkSize('GaltDex');
checkSize('GaltToken');
checkSize('LandUtils');
checkSize('MultiSigRegistry');
checkSize('OracleStakesAccounting');
checkSize('Oracles');
checkSize('PlotClarificationManager');
checkSize('PlotCustodianManager');
checkSize('PlotEscrow');
checkSize('PlotEscrowLib');
checkSize('PlotManager');
checkSize('PlotManagerLib');
checkSize('PlotValutaion');
checkSize('SpaceDex');
checkSize('SpaceToken');
checkSize('SpaceReputationAccounting');
checkSize('SplitMerge');
checkSize('SpaceSplitOperation');

console.log('\nFactories...');
checkSize('MultiSigFactory');
checkSize('ArbitratorsMultiSigFactory');
checkSize('ArbitratorVotingFactory');
checkSize('OracleStakesAccountingFactory');
console.log('\n');

function checkSize(contract) {
  let abi;
  try {
    abi = JSON.parse(fs.readFileSync(`build/contracts/${contract}.json`));
  } catch (e) {
    return;
  }
  console.log(contract, Buffer.byteLength(abi.deployedBytecode, 'utf8') / 2, 'bytes');
}
