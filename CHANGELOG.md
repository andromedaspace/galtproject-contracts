## Galt Project Contracts [v0.3.0](https://github.com/galtspace/galtproject-contracts/tree/v0.3.0) (2018-10-17)

The full list of included changes:

* SpaceToken. Remove geohash/package support. Contract is simplified to keep track of an only entity.
* PlotClarificationManager. Remove hardcoded `clarification_pusher` role. Now all roles of this contract are dynamic.
* PlotClarificationManager. Remove `VALUATION_REQUIRED`, `VALUATION`, `PAYMENT_REQUIRED`, `PACKED` statuses and associated methods.
* PlotClarificationManager. Now an application accepts `newContour` array to be verified by validators.
* SplitMerge. Split packs(currently unsafe): set contour for old pack and create another new pack.
* SplitMerge. Merge packs(currently unsafe): set contour for destination pack and burn source pack.
* Rename `packageTokenId` => `spaceTokenId` since there are no `package` term anymore.
* Add ArraySet collection.
* Add PlotEscrow open orders caching.
* PlotEscrow contract size optimizations.


## Galt Project Contracts [v0.2.0](https://github.com/galtspace/galtproject-contracts/tree/v0.2.0) (2018-10-12)

There was no release of v0.1.0, so here is a full list of the initial features:

* GaltToken (`GALT`) - ERC20 token used within Galt Project contracts
* SpaceToken (`SPACE`) - ERC721 token used for tracking plot ownership
* GaltDex - ETH <=> GALT exchange
* SpaceDex - SPACE <=> GALT exchange
* SplitMerge - system contract for `SPACE` token merge and split operations
* Validators - CRUD management for system-wide validators
* LandUtils - utils, tools, helpers, etc.

* Application contracts:
  * PlotManager - `SPACE` token mint applications
  * PlotClarificationManager - `SPACE` token amend applications
  * PlotValuation - `SPACE` token valuation applications
  * PlotCustodianManager - `SPACE` token custodian assignment applications
  * PlotEscrow - a quick way to sell an already registered `SPACE` token
