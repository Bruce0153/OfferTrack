const assert = require('assert');
const State = require('../status-state-machine.js');

assert.strictEqual(State.decide('已投递','筛选中',{ matchConfidence:.95, rawStatus:'筛选中' }).allowed, true);
assert.strictEqual(State.decide('筛选中','面试中',{ matchConfidence:.95, rawStatus:'一面安排中' }).allowed, true, 'forward skip should be allowed');
assert.strictEqual(State.decide('面试中','已投递',{ matchConfidence:.99, rawStatus:'已投递' }).allowed, false, 'backward transition must be blocked');
assert.strictEqual(State.decide('面试中','已结束',{ matchConfidence:.99, rawStatus:'流程中' }).allowed, false, 'weak terminal evidence must be blocked');
assert.strictEqual(State.decide('面试中','已结束',{ matchConfidence:.99, rawStatus:'很遗憾，流程已结束' }).allowed, true, 'explicit terminal evidence should be allowed');
assert.strictEqual(State.decide('筛选中','已撤回',{ matchConfidence:.99, rawStatus:'撤回成功' }).allowed, true);
assert.strictEqual(State.decide('已结束','面试中',{ matchConfidence:1, rawStatus:'面试中' }).allowed, false, 'terminal states should be sticky');
assert.strictEqual(State.decide('筛选中','面试中',{ matchConfidence:.70, rawStatus:'面试中' }).allowed, false, 'low confidence may not update');

console.log('status-state-machine-v25.test.js PASS');
