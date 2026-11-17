import {ComparisonLedger} from '../../scripts/comparison/budget.mjs';
const set=ComparisonLedger.prototype.setLane;
ComparisonLedger.prototype.setLane=function(lane){return set.call(this,lane,'continuation');};
